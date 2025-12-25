import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LLMService } from '../../llm/llm.service';
import { ConversationService } from './conversation.service';
import { ConversationContextService } from './conversation-context.service';
import { ChatResearchService } from './chat-research.service';
import { ChatStreamEvent } from '../interfaces/chat-stream-event.interface';
import { ChatMessage } from '../../llm/interfaces/chat-message.interface';
import { ContextOptions } from '../interfaces/context-options.interface';

@Injectable()
export class ChatOrchestratorService {
  private readonly logger = new Logger(ChatOrchestratorService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly llmService: LLMService,
    private readonly conversationService: ConversationService,
    private readonly contextService: ConversationContextService,
    private readonly chatResearchService: ChatResearchService,
  ) {}

  /**
   * Process a chat message and stream the response
   * @param conversationId The conversation ID
   * @param assistantMessageId The existing assistant message ID (placeholder)
   * @returns The assistant message ID
   */
  async processMessage(
    conversationId: string,
    assistantMessageId: string,
  ): Promise<string> {
    // Wait briefly for SSE connection to be established
    // The frontend opens the SSE connection after receiving the HTTP response,
    // so we need to give it time to connect before emitting events
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Emit start event
    this.emitEvent(assistantMessageId, {
      type: 'start',
      messageId: assistantMessageId,
    });

    try {
      // Get conversation with messages for context
      const conversation =
        await this.conversationService.getConversation(conversationId);

      // Get the last user message to extract context options
      const lastUserMessage = [...conversation.messages]
        .reverse()
        .find((msg) => msg.role === 'user');

      // Build context options from the last user message
      const contextOptions: ContextOptions = {
        scope: lastUserMessage?.messageOptions?.contextScope || 'recent',
        selectedMessageIds: lastUserMessage?.messageOptions?.selectedMessageIds,
      };

      // Check if research is enabled for this message
      let researchAnswer: string | null = null;
      let researchSources: { title: string; url: string }[] = [];

      if (lastUserMessage?.messageOptions?.researchEnabled) {
        try {
          // Initialize research to get logId BEFORE execution starts
          const { logId, contextualizedQuery } =
            await this.chatResearchService.initializeResearch(
              conversationId,
              lastUserMessage.content,
            );

          // Emit research start event WITH logId so frontend can track progress
          this.emitEvent(assistantMessageId, {
            type: 'research_start',
            messageId: assistantMessageId,
            data: { logId },
          });

          // Execute research (progress events will flow via log.{logId} channel)
          const researchResult =
            await this.chatResearchService.executeResearchWithLogId(
              conversationId,
              logId,
              contextualizedQuery,
              lastUserMessage.id,
            );

          researchAnswer = researchResult.answer;
          researchSources = researchResult.sources.map((source) => ({
            title: source.title,
            url: source.url,
          }));

          // Emit research complete event with logId
          this.emitEvent(assistantMessageId, {
            type: 'research_complete',
            messageId: assistantMessageId,
            data: { logId },
          });
        } catch (error) {
          this.logger.error(
            `Research failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          // Continue with normal chat flow even if research fails
          this.emitEvent(assistantMessageId, {
            type: 'research_complete',
            messageId: assistantMessageId,
            error: error instanceof Error ? error.message : 'Research failed',
          });
        }
      }

      // Build context messages using the context service
      let messages: ChatMessage[] = await this.contextService.buildContext(
        conversationId,
        contextOptions,
      );

      // Add current date context to all chat responses
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const dateContextMessage: ChatMessage = {
        role: 'system',
        content: `Today's date is ${currentDate}. Provide accurate, up-to-date information based on this current date.`,
      };

      // Insert date context at the beginning
      messages = [dateContextMessage, ...messages];

      // If research was performed, add research findings to context
      if (researchAnswer) {
        const sourcesText = researchSources
          .map((s, idx) => `${idx + 1}. ${s.title} (${s.url})`)
          .join('\n');

        const researchContextMessage: ChatMessage = {
          role: 'system',
          content: `Research findings for context:\n\n${researchAnswer}\n\nSources:\n${sourcesText}\n\nPlease synthesize this research information into your response naturally.`,
        };

        // Insert research context before the last user message
        messages = [
          ...messages.slice(0, -1),
          researchContextMessage,
          messages[messages.length - 1],
        ];
      }

      // Stream the response
      let fullContent = '';
      let tokenCount = 0;

      for await (const chunk of this.llmService.chatStream(messages)) {
        if (chunk.content) {
          fullContent += chunk.content;
          this.emitEvent(assistantMessageId, {
            type: 'token',
            messageId: assistantMessageId,
            content: chunk.content,
          });
        }

        if (chunk.done && chunk.usage) {
          tokenCount = chunk.usage.totalTokens;
        }
      }

      // Update the existing assistant message with the generated content
      await this.conversationService.updateMessageContent(
        assistantMessageId,
        fullContent,
      );

      // Update token count
      await this.conversationService.updateMessageTokenCount(
        assistantMessageId,
        tokenCount,
      );

      // Emit done event
      this.emitEvent(assistantMessageId, {
        type: 'done',
        messageId: assistantMessageId,
        usage: {
          promptTokens: 0,
          completionTokens: tokenCount,
          totalTokens: tokenCount,
        },
      });

      return assistantMessageId;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An error occurred while processing the message';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error processing message: ${errorMessage}`,
        errorStack,
      );
      this.emitEvent(assistantMessageId, {
        type: 'error',
        messageId: assistantMessageId,
        error: errorMessage,
      });
      throw error;
    }
  }

  private emitEvent(messageId: string, event: ChatStreamEvent): void {
    this.eventEmitter.emit(`chat.${messageId}`, event);
  }
}
