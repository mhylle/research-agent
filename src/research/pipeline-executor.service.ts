import { Injectable } from '@nestjs/common';
import { OllamaService } from '../llm/ollama.service';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { ResearchLogger } from '../logging/research-logger.service';
import { StageContext } from './interfaces/stage-context.interface';
import { StageResult } from './interfaces/stage-result.interface';
import { ChatMessage } from '../llm/interfaces/chat-message.interface';

@Injectable()
export class PipelineExecutor {
  constructor(
    private ollamaService: OllamaService,
    private toolRegistry: ToolRegistry,
    private logger: ResearchLogger,
  ) {}

  async executeStage(context: StageContext): Promise<StageResult> {
    const startTime = Date.now();
    const startTimestamp = new Date().toISOString();

    try {
      this.logger.logStageInput(context.stageNumber, context.logId, {
        messages: context.messages,
        tools: context.tools,
        systemPrompt: context.systemPrompt,
        startTimestamp,
        messagesCount: context.messages.length,
        toolsCount: context.tools.length,
      });

      // Add system prompt to messages
      const messages: ChatMessage[] = [
        { role: 'system', content: context.systemPrompt },
        ...context.messages,
      ];

      const response = await this.executeWithRetry(() =>
        this.ollamaService.chat(
          messages,
          context.tools.length > 0 ? context.tools : undefined
        )
      );

      const executionTime = Date.now() - startTime;

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
        executionTime
      );

      return result;
    } catch (error) {
      this.logger.logStageError(context.stageNumber, context.logId, error);
      throw error;
    }
  }

  async executeToolCalls(toolCalls: any[], logId: string): Promise<any[]> {
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      const startTime = Date.now();
      const { name, arguments: args } = toolCall.function;

      try {
        const result = await this.executeWithRetry(() =>
          this.toolRegistry.execute(name, args)
        );
        const executionTime = Date.now() - startTime;

        this.logger.logToolExecution(logId, name, args, result, executionTime);
        results.push(result);
      } catch (error) {
        this.logger.logStageError(0, logId, error);
        throw error;
      }
    }

    return results;
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    backoffMs = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await this.delay(backoffMs * Math.pow(2, i));
        this.logger.logStageError(0, 'retry', { attempt: i + 1, error: error.message });
      }
    }
    // This should never be reached due to throw in the loop
    throw new Error('executeWithRetry: Maximum retries exceeded');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
