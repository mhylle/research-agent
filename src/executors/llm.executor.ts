import { Injectable } from '@nestjs/common';
import { LLMService } from '../llm/llm.service';
import { Executor } from './interfaces/executor.interface';
import { ExecutorResult } from './interfaces/executor-result.interface';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';
import { ChatMessage } from '../llm/interfaces/chat-message.interface';
import { ReasoningTraceService } from '../reasoning/services/reasoning-trace.service';

@Injectable()
export class LLMExecutor implements Executor {
  constructor(
    private llmService: LLMService,
    private reasoningTrace: ReasoningTraceService,
  ) {}

  async execute(step: PlanStep, logId?: string): Promise<ExecutorResult> {
    const startTime = Date.now();
    const config = step.config || {};

    // Emit action_planned reasoning trace before synthesis
    let actionId: string | undefined;
    if (logId) {
      try {
        const reasoning = this.getSynthesisReasoning(step.toolName, config);
        actionId = await this.reasoningTrace.emitActionPlan(
          logId,
          `Synthesize research findings`,
          step.toolName,
          { prompt: this.truncateForDisplay(String(config.prompt || '')) },
          reasoning,
        );
      } catch (error) {
        console.warn(
          '[LLMExecutor] Failed to emit action_planned trace:',
          error,
        );
        // Don't fail the execution if reasoning trace fails
      }
    }

    try {
      const messages: ChatMessage[] = [];

      if (config.systemPrompt) {
        messages.push({
          role: 'system',
          content: String(config.systemPrompt),
        });
      }

      if (config.context) {
        messages.push({
          role: 'user',
          content: `Context:\n${String(config.context)}`,
        });
      }

      messages.push({
        role: 'user',
        content: String(config.prompt || 'Please provide a response.'),
      });

      const response = await this.llmService.chat(messages);
      const durationMs = Date.now() - startTime;

      const promptTokens = response.prompt_eval_count || 0;
      const completionTokens = response.eval_count || 0;

      // Emit observation reasoning trace after successful synthesis
      if (logId && actionId) {
        try {
          const resultSummary = this.summarizeSynthesisResult(
            response.message.content,
          );
          const analysis = this.analyzeSynthesisResult(
            response.message.content,
            completionTokens,
          );
          const implications = this.extractSynthesisImplications(
            response.message.content,
          );

          await this.reasoningTrace.emitObservation(
            logId,
            actionId,
            resultSummary,
            analysis,
            implications,
          );
        } catch (error) {
          console.warn(
            '[LLMExecutor] Failed to emit observation trace:',
            error,
          );
          // Don't fail the execution if reasoning trace fails
        }
      }

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

      // Emit observation reasoning trace with error details
      if (logId && actionId) {
        try {
          const errorSummary = `Synthesis failed: ${error.message}`;
          const errorAnalysis = `Error occurred during answer synthesis. This may be due to LLM service unavailability or context length issues.`;
          const errorImplications = [
            'Research answer may be incomplete',
            'May need to retry synthesis',
            'Consider simplifying the context provided',
          ];

          await this.reasoningTrace.emitObservation(
            logId,
            actionId,
            errorSummary,
            errorAnalysis,
            errorImplications,
          );
        } catch (traceError) {
          console.warn(
            '[LLMExecutor] Failed to emit error observation trace:',
            traceError,
          );
          // Don't fail the execution if reasoning trace fails
        }
      }

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

  /**
   * Generate reasoning for why synthesis is being performed
   */
  private getSynthesisReasoning(
    toolName: string,
    config: Record<string, unknown>,
  ): string {
    const hasContext = !!config.context;
    const hasSystemPrompt = !!config.systemPrompt;

    return `Generating comprehensive research answer. ${hasContext ? 'Using gathered source data as context.' : ''} ${hasSystemPrompt ? 'Following specific synthesis instructions.' : 'Using default synthesis approach.'}`.trim();
  }

  /**
   * Create a concise summary of the synthesis result
   */
  private summarizeSynthesisResult(content: string): string {
    if (!content) {
      return 'Synthesis produced no output';
    }

    const wordCount = content.split(/\s+/).length;
    const paragraphCount = content.split(/\n\n+/).filter((p) => p.trim()).length;

    return `Generated ${wordCount} word response with ${paragraphCount} paragraph(s)`;
  }

  /**
   * Analyze the quality and completeness of the synthesis
   */
  private analyzeSynthesisResult(content: string, tokens: number): string {
    if (!content) {
      return 'Synthesis failed to produce meaningful content';
    }

    const wordCount = content.split(/\s+/).length;

    if (wordCount < 50) {
      return 'Brief synthesis generated - may need more detail';
    } else if (wordCount < 200) {
      return 'Moderate synthesis generated - covers main points';
    } else {
      return `Comprehensive synthesis generated (${tokens} tokens) - detailed coverage`;
    }
  }

  /**
   * Extract implications of the synthesis result
   */
  private extractSynthesisImplications(content: string): string[] {
    const implications: string[] = [];

    if (!content) {
      implications.push('No answer generated - research may be incomplete');
      implications.push('Consider retrying with different context');
      return implications;
    }

    const wordCount = content.split(/\s+/).length;

    implications.push('Research answer successfully generated');

    if (wordCount > 200) {
      implications.push('Comprehensive answer provided to user');
    }

    if (content.includes('however') || content.includes('although')) {
      implications.push('Answer includes nuanced perspectives');
    }

    if (
      content.includes('source') ||
      content.includes('according to') ||
      content.includes('research shows')
    ) {
      implications.push('Answer references gathered sources');
    }

    implications.push('Ready for confidence scoring');

    return implications;
  }

  /**
   * Truncate content for display in reasoning traces
   */
  private truncateForDisplay(content: string, maxLength: number = 150): string {
    if (!content) return '';
    return content.length > maxLength
      ? content.substring(0, maxLength) + '...'
      : content;
  }
}
