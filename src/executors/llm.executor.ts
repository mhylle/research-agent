import { Injectable } from '@nestjs/common';
import { OllamaService } from '../llm/ollama.service';
import { Executor } from './interfaces/executor.interface';
import { ExecutorResult } from './interfaces/executor-result.interface';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';
import { ChatMessage } from '../llm/interfaces/chat-message.interface';

@Injectable()
export class LLMExecutor implements Executor {
  constructor(private llmService: OllamaService) {}

  async execute(step: PlanStep): Promise<ExecutorResult> {
    const startTime = Date.now();

    try {
      const messages: ChatMessage[] = [];

      if (step.config.systemPrompt) {
        messages.push({
          role: 'system',
          content: String(step.config.systemPrompt),
        });
      }

      if (step.config.context) {
        messages.push({
          role: 'user',
          content: `Context:\n${String(step.config.context)}`,
        });
      }

      messages.push({ role: 'user', content: String(step.config.prompt) });

      const response = await this.llmService.chat(messages);
      const durationMs = Date.now() - startTime;

      const promptTokens = response.prompt_eval_count || 0;
      const completionTokens = response.eval_count || 0;

      return {
        output: response.message.content,
        durationMs,
        tokensUsed: {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens,
        },
        metadata: {
          model: 'qwen2.5',
          loadDuration: response.load_duration,
          evalDuration: response.eval_duration,
        },
      };
    } catch (err) {
      const error = err as Error;
      const durationMs = Date.now() - startTime;

      return {
        output: null,
        durationMs,
        error: {
          message: error.message,
          stack: error.stack,
        },
        metadata: {
          stepId: step.id,
          toolName: step.toolName,
        },
      };
    }
  }
}
