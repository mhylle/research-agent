import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MessageEntity } from '../entities/message.entity';
import { ConversationEntity } from '../entities/conversation.entity';
import { ContextOptions } from '../interfaces/context-options.interface';
import { ChatMessage } from '../../llm/interfaces/chat-message.interface';
import { LLMService } from '../../llm/llm.service';

/**
 * Service for building and managing conversation context for LLM calls.
 * Handles context window management, summarization, and message selection.
 */
@Injectable()
export class ConversationContextService {
  private readonly logger = new Logger(ConversationContextService.name);

  // Default context window size (in approximate tokens)
  private readonly DEFAULT_MAX_TOKENS = 4096;
  // Threshold to trigger summarization (50% of context window)
  private readonly SUMMARIZATION_THRESHOLD = 0.5;
  // Number of recent messages to keep verbatim
  private readonly RECENT_MESSAGES_COUNT = 10;
  // Approximate tokens per character (rough estimate)
  private readonly TOKENS_PER_CHAR = 0.25;

  constructor(
    @InjectRepository(MessageEntity)
    private messageRepository: Repository<MessageEntity>,
    @InjectRepository(ConversationEntity)
    private conversationRepository: Repository<ConversationEntity>,
    private readonly llmService: LLMService,
  ) {}

  /**
   * Build context messages for LLM based on conversation history and options
   */
  async buildContext(
    conversationId: string,
    options: ContextOptions = { scope: 'recent' },
  ): Promise<ChatMessage[]> {
    this.logger.debug(
      `Building context for conversation ${conversationId} with scope: ${options.scope}`,
    );

    const { scope, selectedMessageIds, maxTokens } = options;
    const effectiveMaxTokens = maxTokens || this.DEFAULT_MAX_TOKENS;

    let messages: MessageEntity[];

    try {
      switch (scope) {
        case 'recent':
          messages = await this.getRecentMessages(conversationId);
          break;
        case 'full':
          messages = await this.getFullContext(
            conversationId,
            effectiveMaxTokens,
          );
          break;
        case 'custom':
          if (!selectedMessageIds || selectedMessageIds.length === 0) {
            this.logger.warn(
              'Custom scope requested but no message IDs provided, falling back to recent',
            );
            messages = await this.getRecentMessages(conversationId);
          } else {
            messages = await this.getSelectedMessages(selectedMessageIds);
          }
          break;
        default:
          messages = await this.getRecentMessages(conversationId);
      }

      this.logger.debug(
        `Built context with ${messages.length} messages (~${this.estimateTokenCount(messages)} tokens)`,
      );

      return this.messagesToChatMessages(messages);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error building context for conversation ${conversationId}: ${message}`,
      );
      // Return empty context on error to prevent LLM call failure
      return [];
    }
  }

  /**
   * Get recent N messages from conversation
   */
  private async getRecentMessages(
    conversationId: string,
  ): Promise<MessageEntity[]> {
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: this.RECENT_MESSAGES_COUNT,
    });

    // Reverse to get chronological order (oldest first)
    return messages.reverse();
  }

  /**
   * Get full context with summarization if needed
   */
  private async getFullContext(
    conversationId: string,
    maxTokens: number,
  ): Promise<MessageEntity[]> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      this.logger.warn(
        `Conversation ${conversationId} not found, returning empty context`,
      );
      return [];
    }

    // Check if we should summarize
    if (this.shouldSummarize(conversation, maxTokens)) {
      return this.getContextWithSummary(conversationId);
    }

    // Return all messages if under threshold
    return this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get context with older messages summarized
   * @param conversationId - The conversation ID
   */
  private async getContextWithSummary(
    conversationId: string,
  ): Promise<MessageEntity[]> {
    this.logger.debug(
      `Conversation exceeds token threshold, applying summarization`,
    );

    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    // Get all messages
    const allMessages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    if (allMessages.length === 0) {
      return [];
    }

    if (allMessages.length <= this.RECENT_MESSAGES_COUNT) {
      return allMessages;
    }

    // Split into older and recent messages
    const recentMessages = allMessages.slice(-this.RECENT_MESSAGES_COUNT);
    const olderMessages = allMessages.slice(0, -this.RECENT_MESSAGES_COUNT);

    // Check if we have a cached summary
    if (conversation?.summary) {
      this.logger.debug('Using cached conversation summary');
      const summaryMessage = this.createSummaryMessage(conversation.summary);
      return [summaryMessage, ...recentMessages];
    }

    // Generate new summary
    try {
      const summary = await this.summarizeHistory(olderMessages);

      // Cache the summary
      if (conversation) {
        await this.conversationRepository.update(conversationId, { summary });
        this.logger.debug('Cached new conversation summary');
      }

      const summaryMessage = this.createSummaryMessage(summary);
      return [summaryMessage, ...recentMessages];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to generate summary, returning all messages: ${message}`,
      );
      return allMessages;
    }
  }

  /**
   * Get selected messages by IDs
   */
  private async getSelectedMessages(
    messageIds: string[],
  ): Promise<MessageEntity[]> {
    if (messageIds.length === 0) {
      return [];
    }

    const messages = await this.messageRepository.find({
      where: { id: In(messageIds) },
      order: { createdAt: 'ASC' },
    });

    if (messages.length !== messageIds.length) {
      this.logger.warn(
        `Requested ${messageIds.length} messages but found ${messages.length}`,
      );
    }

    return messages;
  }

  /**
   * Summarize conversation history using LLM
   */
  async summarizeHistory(messages: MessageEntity[]): Promise<string> {
    if (messages.length === 0) {
      return '';
    }

    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    const summaryPrompt: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a helpful assistant that creates concise summaries of conversations. Focus on key topics discussed, decisions made, and important context that would be useful for continuing the conversation.',
      },
      {
        role: 'user',
        content: `Please summarize the following conversation in 2-3 paragraphs, preserving key information and context:\n\n${conversationText}`,
      },
    ];

    try {
      const response = await this.llmService.chat(summaryPrompt);
      return response.message.content || '';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error summarizing history: ${message}`);
      // Fallback to a simple truncation
      return `Previous conversation summary (${messages.length} messages): ${messages
        .slice(-3)
        .map((m) => m.content.substring(0, 100))
        .join(' ... ')}`;
    }
  }

  /**
   * Count approximate tokens in text
   */
  countTokens(text: string): number {
    // Simple approximation: ~4 characters per token for English text
    return Math.ceil(text.length * this.TOKENS_PER_CHAR);
  }

  /**
   * Estimate total tokens for a set of messages
   */
  private estimateTokenCount(messages: MessageEntity[]): number {
    return messages.reduce(
      (total, msg) => total + this.countTokens(msg.content),
      0,
    );
  }

  /**
   * Check if conversation should be summarized based on token threshold
   */
  private shouldSummarize(
    conversation: ConversationEntity,
    maxTokens: number,
  ): boolean {
    const threshold = maxTokens * this.SUMMARIZATION_THRESHOLD;
    return conversation.tokenCount > threshold;
  }

  /**
   * Build a summary for context injection (used by ChatResearchService)
   */
  async buildContextSummary(conversationId: string): Promise<string> {
    const messages = await this.getRecentMessages(conversationId);

    if (messages.length === 0) {
      return '';
    }

    // For short conversations, just return the recent context
    if (messages.length <= 5) {
      return messages
        .map(
          (m) =>
            `${m.role}: ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`,
        )
        .join('\n');
    }

    // For longer conversations, create a brief summary
    try {
      return await this.summarizeHistory(messages);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error building context summary: ${message}, falling back to simple format`,
      );
      // Fallback to simple format
      return messages
        .map(
          (m) =>
            `${m.role}: ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`,
        )
        .join('\n');
    }
  }

  /**
   * Convert MessageEntity array to ChatMessage array
   */
  private messagesToChatMessages(messages: MessageEntity[]): ChatMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Create a synthetic message containing the summary
   */
  private createSummaryMessage(summary: string): MessageEntity {
    const message = new MessageEntity();
    message.id = 'summary';
    message.role = 'system';
    message.content = `Previous conversation summary:\n${summary}`;
    message.createdAt = new Date(0); // Ensure it appears first chronologically
    message.conversationId = ''; // Will be overridden by context
    message.messageOptions = { researchEnabled: false };
    message.tokenCount = this.countTokens(message.content);
    return message;
  }
}
