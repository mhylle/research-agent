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

    try {
      this.logger.logStageInput(context.stageNumber, context.logId, {
        messagesCount: context.messages.length,
        toolsCount: context.tools.length,
      });

      // Add system prompt to messages
      const messages: ChatMessage[] = [
        { role: 'system', content: context.systemPrompt },
        ...context.messages,
      ];

      const response = await this.ollamaService.chat(
        messages,
        context.tools.length > 0 ? context.tools : undefined
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
          hasToolCalls: result.tool_calls.length > 0,
          toolCallsCount: result.tool_calls.length,
        },
        executionTime
      );

      return result;
    } catch (error) {
      this.logger.logStageError(context.stageNumber, context.logId, error);
      throw error;
    }
  }
}
