import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { Executor } from './interfaces/executor.interface';
import { ExecutorResult } from './interfaces/executor-result.interface';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';

@Injectable()
export class ToolExecutor implements Executor {
  constructor(
    private toolRegistry: ToolRegistry,
    private eventEmitter: EventEmitter2,
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

    try {
      const tool = this.toolRegistry.getTool(step.toolName);
      if (!tool) {
        throw new Error(
          `Tool "${step.toolName}" not found in registry. Available tools: ${this.getAvailableTools().map((t) => t.function.name).join(', ')}`,
        );
      }

      console.log(`[ToolExecutor] Found tool: ${tool.definition.function.name}`);
      const result: unknown = await this.toolRegistry.execute(
        step.toolName,
        step.config,
      );
      const durationMs = Date.now() - startTime;
      console.log(
        `[ToolExecutor] Tool execution completed in ${durationMs}ms`,
      );

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
}
