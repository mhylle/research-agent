import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { Executor } from './interfaces/executor.interface';
import { ExecutorResult } from './interfaces/executor-result.interface';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';
import { ReasoningTraceService } from '../reasoning/services/reasoning-trace.service';

@Injectable()
export class ToolExecutor implements Executor {
  constructor(
    private toolRegistry: ToolRegistry,
    private eventEmitter: EventEmitter2,
    private reasoningTrace: ReasoningTraceService,
  ) {}

  async execute(step: PlanStep, logId?: string): Promise<ExecutorResult> {
    const startTime = Date.now();

    console.log(`[ToolExecutor] Executing tool: ${step.toolName}`);
    console.log(`[ToolExecutor] Arguments:`, step.config);

    // Emit tool_call_started event
    this.eventEmitter.emit('tool.call.started', {
      logId,
      toolName: step.toolName,
      input: this.truncateData(step.config),
      stepId: step.id,
      phaseId: (step as any).phaseId,
      timestamp: new Date(),
    });

    // Emit action_planned reasoning trace before execution
    let actionId: string | undefined;
    if (logId) {
      try {
        const reasoning = this.getToolReasoning(step.toolName, step.config);
        actionId = await this.reasoningTrace.emitActionPlan(
          logId,
          `Execute ${step.toolName}`,
          step.toolName,
          step.config,
          reasoning,
        );
      } catch (error) {
        console.warn(
          '[ToolExecutor] Failed to emit action_planned trace:',
          error,
        );
        // Don't fail the execution if reasoning trace fails
      }
    }

    try {
      const tool = this.toolRegistry.getTool(step.toolName);
      if (!tool) {
        throw new Error(
          `Tool "${step.toolName}" not found in registry. Available tools: ${this.getAvailableTools()
            .map((t) => t.function.name)
            .join(', ')}`,
        );
      }

      console.log(
        `[ToolExecutor] Found tool: ${tool.definition.function.name}`,
      );
      const result: unknown = await this.toolRegistry.execute(
        step.toolName,
        step.config,
      );
      const durationMs = Date.now() - startTime;
      console.log(`[ToolExecutor] Tool execution completed in ${durationMs}ms`);

      // Emit observation reasoning trace after successful execution
      if (logId && actionId) {
        try {
          const resultSummary = this.summarizeResult(result, step.toolName);
          const analysis = this.analyzeResult(result, step.toolName);
          const implications = this.extractImplications(result, step.toolName);

          await this.reasoningTrace.emitObservation(
            logId,
            actionId,
            resultSummary,
            analysis,
            implications,
          );
        } catch (error) {
          console.warn(
            '[ToolExecutor] Failed to emit observation trace:',
            error,
          );
          // Don't fail the execution if reasoning trace fails
        }
      }

      // Emit tool_call_completed event
      this.eventEmitter.emit('tool.call.completed', {
        logId,
        toolName: step.toolName,
        input: this.truncateData(step.config),
        output: this.truncateData(result),
        durationMs,
        stepId: step.id,
        timestamp: new Date(),
      });

      return {
        output: result as Record<string, unknown>,
        durationMs,
        metadata: {
          toolName: step.toolName,
          inputConfig: step.config,
        },
      };
    } catch (err) {
      const error = err as Error;
      const durationMs = Date.now() - startTime;

      console.error(`[ToolExecutor] Tool execution failed:`, error.message);
      console.error(`[ToolExecutor] Error stack:`, error.stack);

      // Emit observation reasoning trace with error details
      if (logId && actionId) {
        try {
          const errorSummary = `Tool execution failed: ${error.message}`;
          const errorAnalysis = `Error occurred during ${step.toolName} execution. This may be due to invalid parameters, network issues, or service unavailability.`;
          const errorImplications = [
            'Need to investigate error cause',
            'May need to retry with different parameters',
            'Consider using alternative tool or approach',
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
            '[ToolExecutor] Failed to emit error observation trace:',
            traceError,
          );
          // Don't fail the execution if reasoning trace fails
        }
      }

      // Emit tool_call_failed event
      this.eventEmitter.emit('tool.call.failed', {
        logId,
        toolName: step.toolName,
        input: this.truncateData(step.config),
        error: error.message,
        durationMs,
        stepId: step.id,
        timestamp: new Date(),
      });

      return {
        output: null,
        durationMs,
        error: {
          message: error.message,
          stack: error.stack,
        },
        metadata: {
          toolName: step.toolName,
          inputConfig: step.config,
        },
      };
    }
  }

  getAvailableTools(): ToolDefinition[] {
    return this.toolRegistry.getDefinitions();
  }

  /**
   * Truncate and serialize data safely for event emission.
   * Converts data to JSON string and truncates if longer than 1000 characters.
   */
  private truncateData(data: unknown): string {
    try {
      const serialized = JSON.stringify(data);
      if (serialized.length > 1000) {
        return serialized.substring(0, 1000) + '... (truncated)';
      }
      return serialized;
    } catch (error) {
      // If serialization fails, return a safe representation
      return '[Unable to serialize data]';
    }
  }

  /**
   * Generate reasoning for why this tool was chosen
   */
  private getToolReasoning(
    toolName: string,
    config: Record<string, unknown>,
  ): string {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      return `Tool "${toolName}" selected for execution`;
    }

    const description =
      tool.definition.function.description || 'No description';
    const params = Object.keys(config).join(', ');

    return `Executing ${toolName}: ${description}. Parameters: ${params}`;
  }

  /**
   * Create a concise summary of the tool result
   */
  private summarizeResult(result: unknown, toolName: string): string {
    if (result === null || result === undefined) {
      return 'Tool execution returned no result';
    }

    if (Array.isArray(result)) {
      return `Retrieved ${result.length} items from ${toolName}`;
    }

    if (typeof result === 'object') {
      const keys = Object.keys(result as Record<string, unknown>);
      if (keys.includes('results') && Array.isArray((result as any).results)) {
        return `Retrieved ${(result as any).results.length} results from ${toolName}`;
      }
      return `Tool returned object with ${keys.length} properties: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`;
    }

    const stringResult = String(result);
    return stringResult.length > 200
      ? stringResult.substring(0, 200) + '...'
      : stringResult;
  }

  /**
   * Analyze what the result means for the research task
   */
  private analyzeResult(result: unknown, toolName: string): string {
    if (!result) {
      return 'No data retrieved - may need to try alternative approaches';
    }

    if (Array.isArray(result)) {
      if (result.length === 0) {
        return 'No results found - query may need refinement';
      }
      return `Successfully retrieved ${result.length} relevant items for analysis`;
    }

    if (typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      if (obj.results && Array.isArray(obj.results)) {
        return `Retrieved ${obj.results.length} results that can be used for synthesis`;
      }
      if (obj.content) {
        return 'Retrieved content successfully for analysis';
      }
    }

    return 'Tool execution completed with valid output';
  }

  /**
   * Extract implications of the result for next steps
   */
  private extractImplications(result: unknown, toolName: string): string[] {
    const implications: string[] = [];

    if (!result) {
      implications.push('Need to try alternative search strategies');
      implications.push('May need to refine search parameters');
      return implications;
    }

    if (Array.isArray(result)) {
      if (result.length === 0) {
        implications.push('Query may be too specific or contain no matches');
        implications.push('Consider broadening search terms');
      } else if (result.length > 0) {
        implications.push('Have sufficient data to proceed with analysis');
        if (result.length > 10) {
          implications.push('May need to filter or prioritize results');
        }
      }
      return implications;
    }

    if (typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      if (obj.results && Array.isArray(obj.results)) {
        implications.push(
          `Retrieved ${obj.results.length} results for processing`,
        );
      }
      if (obj.content) {
        implications.push('Content available for synthesis');
      }
    }

    implications.push('Result can be used in next phase');
    return implications;
  }
}
