import { Injectable } from '@nestjs/common';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { Executor } from './interfaces/executor.interface';
import { ExecutorResult } from './interfaces/executor-result.interface';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';

@Injectable()
export class ToolExecutor implements Executor {
  constructor(private toolRegistry: ToolRegistry) {}

  async execute(step: PlanStep): Promise<ExecutorResult> {
    const startTime = Date.now();

    try {
      const result: unknown = await this.toolRegistry.execute(
        step.toolName,
        step.config,
      );
      const durationMs = Date.now() - startTime;

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
}
