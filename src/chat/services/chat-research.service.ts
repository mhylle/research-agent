import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ResearchService } from '../../research/research.service';
import { ConversationContextService } from './conversation-context.service';
import { ConversationService } from './conversation.service';
import { ResearchResult } from '../../orchestration/orchestrator.service';
import { Citation } from '../interfaces/citation.interface';
import { ResearchStatus } from '../interfaces/research-status.interface';

/**
 * Service that bridges the chat module to the existing research pipeline.
 * Handles context-aware research execution and citation management.
 */
@Injectable()
export class ChatResearchService {
  private readonly logger = new Logger(ChatResearchService.name);

  // In-memory tracking for research status per conversation
  private researchStatus = new Map<string, ResearchStatus>();

  constructor(
    private readonly researchService: ResearchService,
    private readonly contextService: ConversationContextService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Execute research with conversation context and link results to message
   */
  async executeResearchWithContext(
    conversationId: string,
    query: string,
    messageId: string,
  ): Promise<ResearchResult> {
    this.logger.debug(
      `Executing research for conversation ${conversationId}, message ${messageId}`,
    );

    // Check if research is already running for this conversation
    const status = this.getResearchStatus(conversationId);
    if (status.isResearching) {
      this.logger.warn(
        `Research already running for conversation ${conversationId}, queuing query`,
      );
      // Add to queue (implementation can be extended later)
      status.queuedQueries.push(query);
      throw new Error(
        'Research already in progress for this conversation. Please wait.',
      );
    }

    // Generate a new logId for this research session
    const logId = randomUUID();

    try {
      // Mark research as active
      this.setResearchActive(conversationId, logId);

      // Build context summary from conversation history
      const context =
        await this.contextService.buildContextSummary(conversationId);

      // Build contextualized query
      const contextualizedQuery = this.buildContextualQuery(context, query);

      this.logger.debug(
        `Contextualized query: ${contextualizedQuery.substring(0, 100)}...`,
      );

      // Execute research with contextualized query
      const result = await this.researchService.executeResearch(
        contextualizedQuery,
        logId,
      );

      // Link the message to research
      await this.conversationService.linkResearch(messageId, logId);

      // Extract citations from result
      const citations = this.extractCitations(result);

      // Update message citations
      await this.conversationService.updateMessageCitations(
        messageId,
        citations,
      );

      this.logger.debug(
        `Research completed for message ${messageId}, extracted ${citations.length} citations`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Research execution failed for conversation ${conversationId}: ${errorMessage}`,
      );
      throw error;
    } finally {
      // Mark research as complete
      this.setResearchComplete(conversationId);
    }
  }

  /**
   * Build contextualized query with conversation context
   */
  private buildContextualQuery(context: string, query: string): string {
    if (!context || context.trim() === '') {
      return query;
    }

    return `Given the following conversation context:
${context}

Research query: ${query}`;
  }

  /**
   * Extract citations from research result sources
   */
  private extractCitations(result: ResearchResult): Citation[] {
    if (!result.sources || result.sources.length === 0) {
      return [];
    }

    return result.sources
      .filter((source) => source.url && source.url.trim() !== '')
      .map((source, index) => ({
        index: index + 1,
        url: source.url,
        title: source.title || 'Untitled Source',
        snippet: source.relevance ? source.relevance.substring(0, 200) : '',
      }));
  }

  /**
   * Get research status for a conversation
   */
  getResearchStatus(conversationId: string): ResearchStatus {
    if (!this.researchStatus.has(conversationId)) {
      this.researchStatus.set(conversationId, {
        isResearching: false,
        queuedQueries: [],
      });
    }
    return this.researchStatus.get(conversationId)!;
  }

  /**
   * Set research as active for a conversation
   */
  setResearchActive(conversationId: string, logId: string): void {
    const status = this.getResearchStatus(conversationId);
    status.isResearching = true;
    status.currentLogId = logId;
    this.logger.debug(
      `Research set to active for conversation ${conversationId}, logId: ${logId}`,
    );
  }

  /**
   * Set research as complete for a conversation
   */
  setResearchComplete(conversationId: string): void {
    const status = this.getResearchStatus(conversationId);
    status.isResearching = false;
    status.currentLogId = undefined;
    this.logger.debug(
      `Research marked complete for conversation ${conversationId}`,
    );

    // Process queued queries if any (can be implemented later)
    if (status.queuedQueries.length > 0) {
      this.logger.debug(
        `Found ${status.queuedQueries.length} queued queries for conversation ${conversationId}`,
      );
      // Future: implement queue processing
    }
  }
}
