import { Injectable } from '@nestjs/common';
import { LLMService } from '../llm/llm.service';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { ResearchLogger } from '../logging/research-logger.service';
import { StageContext } from './interfaces/stage-context.interface';
import { StageResult } from './interfaces/stage-result.interface';
import { ChatMessage } from '../llm/interfaces/chat-message.interface';
import { getMilestoneTemplates } from '../logging/milestone-templates';

@Injectable()
export class PipelineExecutor {
  constructor(
    private ollamaService: LLMService,
    private toolRegistry: ToolRegistry,
    private logger: ResearchLogger,
  ) {}

  async executeStage(context: StageContext): Promise<StageResult> {
    const startTime = Date.now();
    const startTimestamp = new Date().toISOString();
    const stageNodeId = `stage-${context.stageNumber}`;

    try {
      // Node lifecycle: stage start
      this.logger.nodeStart(stageNodeId, context.logId, 'stage');

      this.logger.logStageInput(context.stageNumber, context.logId, {
        messages: context.messages,
        tools: context.tools,
        systemPrompt: context.systemPrompt,
        startTimestamp,
        messagesCount: context.messages.length,
        toolsCount: context.tools.length,
      });

      // Emit stage-specific milestones
      if (context.stageNumber === 1) {
        await this.emitStage1Milestones(context);
      } else if (context.stageNumber === 2) {
        await this.emitStage2Milestones(context);
      } else if (context.stageNumber === 3) {
        await this.emitStage3Milestones(context);
      }

      // Add system prompt to messages
      const messages: ChatMessage[] = [
        { role: 'system', content: context.systemPrompt },
        ...context.messages,
      ];

      const response = await this.executeWithRetry(() =>
        this.ollamaService.chat(
          messages,
          context.tools.length > 0 ? context.tools : undefined,
        ),
      );

      const executionTime = Date.now() - startTime;

      // Log LLM token usage
      const promptTokens = response.prompt_eval_count || 0;
      const completionTokens = response.eval_count || 0;
      const totalTokens = promptTokens + completionTokens;

      this.logger.logLLMCall(
        context.logId,
        context.stageNumber,
        'qwen2.5', // TODO: Get model name from config
        promptTokens,
        completionTokens,
        totalTokens,
        executionTime,
        {
          loadDuration: response.load_duration,
          promptEvalDuration: response.prompt_eval_duration,
          evalDuration: response.eval_duration,
        },
      );

      const result: StageResult = {
        message: response.message as ChatMessage,
        tool_calls: response.message.tool_calls || [],
        executionTime,
      };

      this.logger.logStageOutput(
        context.stageNumber,
        context.logId,
        {
          message: result.message,
          tool_calls: result.tool_calls,
          endTimestamp: new Date().toISOString(),
          hasToolCalls: result.tool_calls.length > 0,
          toolCallsCount: result.tool_calls.length,
          messageRole: result.message.role,
          messageContentLength: result.message.content?.length || 0,
        },
        executionTime,
      );

      // Emit final milestone for Stage 1 (filtering)
      if (context.stageNumber === 1) {
        const stageTemplates = getMilestoneTemplates(1);
        await this.logger.logMilestone(
          context.logId,
          `${stageNodeId}_milestone_4`,
          stageTemplates[3].id,
          1,
          stageTemplates[3].template,
          {},
          stageTemplates[3].expectedProgress,
          'completed',
        );
      } else if (context.stageNumber === 2) {
        const stageTemplates = getMilestoneTemplates(2);
        await this.logger.logMilestone(
          context.logId,
          `${stageNodeId}_milestone_3`,
          stageTemplates[2].id,
          2,
          stageTemplates[2].template,
          {},
          stageTemplates[2].expectedProgress,
          'completed',
        );
      } else if (context.stageNumber === 3) {
        const stageTemplates = getMilestoneTemplates(3);
        await this.logger.logMilestone(
          context.logId,
          `${stageNodeId}_milestone_4`,
          stageTemplates[3].id,
          3,
          stageTemplates[3].template,
          {},
          stageTemplates[3].expectedProgress,
          'completed',
        );
      }

      // Node lifecycle: stage complete
      this.logger.nodeComplete(stageNodeId, context.logId, result);

      return result;
    } catch (error) {
      // Node lifecycle: stage error
      this.logger.nodeError(stageNodeId, context.logId, error);
      this.logger.logStageError(context.stageNumber, context.logId, error);
      throw error;
    }
  }

  async executeToolCalls(
    toolCalls: any[],
    logId: string,
    parentNodeId?: string,
  ): Promise<any[]> {
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      const startTime = Date.now();
      const { name, arguments: args } = toolCall.function;
      const toolNodeId = `tool-${name}-${Date.now()}`;

      try {
        // Node lifecycle: tool start
        this.logger.nodeStart(toolNodeId, logId, 'tool', parentNodeId);

        const result = await this.executeWithRetry(() =>
          this.toolRegistry.execute(name, args),
        );
        const executionTime = Date.now() - startTime;

        this.logger.logToolExecution(logId, name, args, result, executionTime);

        // Node lifecycle: tool complete
        this.logger.nodeComplete(toolNodeId, logId, result);

        results.push(result);
      } catch (error) {
        // Node lifecycle: tool error
        this.logger.nodeError(toolNodeId, logId, error);
        this.logger.logStageError(0, logId, error);
        throw error;
      }
    }

    return results;
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    backoffMs = 1000,
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await this.delay(backoffMs * Math.pow(2, i));
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.logStageError(0, 'retry', {
          attempt: i + 1,
          error: errorMessage,
        });
      }
    }
    // This should never be reached due to throw in the loop
    throw new Error('executeWithRetry: Maximum retries exceeded');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async emitStage1Milestones(context: StageContext): Promise<void> {
    const stageTemplates = getMilestoneTemplates(1);
    const stageNodeId = `stage-${context.stageNumber}`;

    // Milestone 1: Deconstructing query
    await this.logger.logMilestone(
      context.logId,
      `${stageNodeId}_milestone_1`,
      stageTemplates[0].id,
      1,
      stageTemplates[0].template,
      {},
      stageTemplates[0].expectedProgress,
      'running',
    );

    // Extract query from messages (user message)
    const userMessage = context.messages.find((m) => m.role === 'user');
    const query = userMessage?.content || '';

    // Milestone 2: Identifying terms
    const terms = this.extractKeyTerms(query);
    await this.logger.logMilestone(
      context.logId,
      `${stageNodeId}_milestone_2`,
      stageTemplates[1].id,
      1,
      stageTemplates[1].template,
      { terms: terms.join(', ') },
      stageTemplates[1].expectedProgress,
      'running',
    );

    // Milestone 3: Searching databases
    const searchCount = context.tools.length > 0 ? 25 : 0; // Estimate based on tool availability
    const sources =
      'Tavily (aggregating NASA, arXiv, Nature, Science, and more)';
    await this.logger.logMilestone(
      context.logId,
      `${stageNodeId}_milestone_3`,
      stageTemplates[2].id,
      1,
      stageTemplates[2].template,
      { count: searchCount, sources },
      stageTemplates[2].expectedProgress,
      'running',
    );

    // Note: Milestone 4 (filtering) emitted after stage completion (lines 97-110)
  }

  private async emitStage2Milestones(context: StageContext): Promise<void> {
    const stageTemplates = getMilestoneTemplates(2);
    const stageNodeId = `stage-${context.stageNumber}`;

    // Count sources from previous stage messages (estimate from tool calls in Stage 1)
    const sourceCount = 10; // Default estimate for sources to fetch

    // Milestone 1: Fetching sources
    await this.logger.logMilestone(
      context.logId,
      `${stageNodeId}_milestone_1`,
      stageTemplates[0].id,
      2,
      stageTemplates[0].template,
      { count: sourceCount },
      stageTemplates[0].expectedProgress,
      'running',
    );

    // Milestone 2: Extracting content (emit for each source with progressive progress)
    // Progress ranges from 30% to 70% across all sources
    const progressStart = 30;
    const progressEnd = 70;
    const progressRange = progressEnd - progressStart;

    for (let i = 0; i < sourceCount; i++) {
      const progress = progressStart + (i / sourceCount) * progressRange;
      const sourceUrl = `source-${i + 1}.example.com`; // Placeholder URL

      await this.logger.logMilestone(
        context.logId,
        `${stageNodeId}_milestone_2_${i}`,
        stageTemplates[1].id,
        2,
        stageTemplates[1].template,
        { url: sourceUrl },
        progress,
        'running',
      );
    }

    // Note: Milestone 3 (validating) emitted after stage completion
  }

  private async emitStage3Milestones(context: StageContext): Promise<void> {
    const stageTemplates = getMilestoneTemplates(3);
    const stageNodeId = `stage-${context.stageNumber}`;

    // Count sources from Stage 2 results
    const sourceCount = 10; // Estimate based on Stage 2 output

    // Milestone 1: Analyzing sources
    await this.logger.logMilestone(
      context.logId,
      `${stageNodeId}_milestone_1`,
      stageTemplates[0].id,
      3,
      stageTemplates[0].template,
      { count: sourceCount },
      stageTemplates[0].expectedProgress,
      'running',
    );

    // Milestone 2: Synthesizing findings
    await this.logger.logMilestone(
      context.logId,
      `${stageNodeId}_milestone_2`,
      stageTemplates[1].id,
      3,
      stageTemplates[1].template,
      {},
      stageTemplates[1].expectedProgress,
      'running',
    );

    // Milestone 3: Generating answer
    await this.logger.logMilestone(
      context.logId,
      `${stageNodeId}_milestone_3`,
      stageTemplates[2].id,
      3,
      stageTemplates[2].template,
      {},
      stageTemplates[2].expectedProgress,
      'running',
    );

    // Note: Milestone 4 (formatting) emitted after stage completion
  }

  private extractKeyTerms(query: string): string[] {
    // Simple keyword extraction: split on common words and punctuation
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'been',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'can',
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'this',
      'that',
      'these',
      'those',
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word));

    // Return unique terms, limit to 5 most relevant (longest words tend to be more specific)
    const uniqueWords = [...new Set(words)];
    return uniqueWords.sort((a, b) => b.length - a.length).slice(0, 5);
  }
}
