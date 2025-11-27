// @ts-nocheck
import { Controller, Param, Sse } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, Subscriber } from 'rxjs';
import { LogService } from '../logging/log.service';
import { LogEntry } from '../logging/interfaces/log-entry.interface';

interface UIEvent {
  id: string;
  logId: string;
  eventType: string;
  timestamp: string;
  planId?: string;
  phaseId?: string;
  stepId?: string;
  title?: string;
  description?: string;
  status?: string;
  durationMs?: number;
  tokensUsed?: { prompt: number; completion: number; total: number };
  toolName?: string;
  outputPreview?: string;
  error?: string;
  phaseName?: string;
  [key: string]: any;
}

@Controller('api/research')
export class ResearchStreamController {
  constructor(
    private eventEmitter: EventEmitter2,
    private logService: LogService,
  ) {}

  @Sse('stream/:logId')
  streamSession(@Param('logId') logId: string): Observable<MessageEvent> {
    console.log(`[SSE] New connection for logId: ${logId}`);
    return new Observable((subscriber: Subscriber<MessageEvent>) => {
      void this.sendExistingLogs(logId, subscriber);

      const listener = (entry: LogEntry) => {
        console.log(`[SSE] Received event for ${logId}: ${entry.eventType}`);
        subscriber.next({
          data: JSON.stringify(this.transformToUIEvent(entry)),
          type: entry.eventType || 'message',
          id: entry.id || '',
        } as any as MessageEvent);
      };

      // Listen for regular log events
      console.log(`[SSE] Setting up listener for: log.${logId}`);
      this.eventEmitter.on(`log.${logId}`, listener);

      // Listen for tool call events
      const toolStartedListener = (entry: LogEntry) => {
        subscriber.next({
          data: JSON.stringify(this.transformToUIEvent(entry)),
          type: 'tool_call_started',
          id: entry.id || '',
        } as any as MessageEvent);
      };

      const toolCompletedListener = (entry: LogEntry) => {
        subscriber.next({
          data: JSON.stringify(this.transformToUIEvent(entry)),
          type: 'tool_call_completed',
          id: entry.id || '',
        } as any as MessageEvent);
      };

      const toolFailedListener = (entry: LogEntry) => {
        subscriber.next({
          data: JSON.stringify(this.transformToUIEvent(entry)),
          type: 'tool_call_failed',
          id: entry.id || '',
        } as any as MessageEvent);
      };

      this.eventEmitter.on(`tool.call.started.${logId}`, toolStartedListener);
      this.eventEmitter.on(
        `tool.call.completed.${logId}`,
        toolCompletedListener,
      );
      this.eventEmitter.on(`tool.call.failed.${logId}`, toolFailedListener);

      return () => {
        this.eventEmitter.off(`log.${logId}`, listener);
        this.eventEmitter.off(
          `tool.call.started.${logId}`,
          toolStartedListener,
        );
        this.eventEmitter.off(
          `tool.call.completed.${logId}`,
          toolCompletedListener,
        );
        this.eventEmitter.off(`tool.call.failed.${logId}`, toolFailedListener);
      };
    });
  }

  private async sendExistingLogs(
    logId: string,
    subscriber: Subscriber<MessageEvent>,
  ): Promise<void> {
    const existingLogs = await this.logService.getSessionLogs(logId);

    for (const entry of existingLogs) {
      subscriber.next({
        data: JSON.stringify(this.transformToUIEvent(entry)),
        type: entry.eventType || 'message',
        id: entry.id || '',
      } as any as MessageEvent);
    }
  }

  private transformToUIEvent(entry: LogEntry): UIEvent {
    return {
      id: entry.id,
      logId: entry.logId,
      eventType: entry.eventType,
      timestamp: entry.timestamp.toISOString(),
      planId: entry.planId,
      phaseId: entry.phaseId,
      stepId: entry.stepId,
      ...this.extractUIData(entry),
    };
  }

  private extractUIData(entry: LogEntry): Partial<UIEvent> {
    const data = entry.data as Record<string, any>;

    switch (entry.eventType) {
      case 'session_started':
        return {
          title: 'Session Started',
          description: `Query: ${String(data.query ?? '')}`,
          status: 'running',
        };

      case 'planning_started':
        return {
          title: '🤔 Planning Started',
          description: String(data.message ?? 'LLM is generating research plan...'),
          status: 'planning',
          availableTools: data.availableTools as string[],
        };

      case 'planning_iteration':
        return {
          title: `Planning Iteration ${String(data.iteration ?? '')}/${String(data.maxIterations ?? '')}`,
          description: String(data.message ?? ''),
          status: 'planning',
          iteration: data.iteration as number,
          maxIterations: data.maxIterations as number,
        };

      case 'plan_created':
        return {
          title: 'Plan Created',
          description: `${String(data.totalPhases ?? 0)} phases planned`,
          totalPhases: data.totalPhases as number,
          // Include full plan details
          planId: String(data.planId ?? ''),
          query: String(data.query ?? ''),
          phases: data.phases,
        };

      case 'phase_added':
        return {
          title: `Phase: ${String(data.name ?? '')}`,
          phaseName: String(data.name ?? ''),
          description: String(data.description ?? ''),
          hasCheckpoint: Boolean(data.replanCheckpoint),
        };

      case 'step_added':
        return {
          title: `Step: ${String(data.toolName ?? '')}`,
          toolName: String(data.toolName ?? ''),
          description: JSON.stringify(data.config ?? {}),
        };

      case 'phase_started':
        return {
          title: `Starting: ${String(data.phaseName ?? '')}`,
          phaseName: String(data.phaseName ?? ''),
          status: 'running',
          stepCount: data.stepCount as number,
        };

      case 'phase_completed':
        return {
          title: `Completed: ${String(data.phaseName ?? '')}`,
          phaseName: String(data.phaseName ?? ''),
          status: 'completed',
          stepsCompleted: data.stepsCompleted as number,
        };

      case 'phase_failed':
        return {
          title: `Failed: ${String(data.phaseName ?? '')}`,
          phaseName: String(data.phaseName ?? ''),
          status: 'error',
          error: String(data.error ?? ''),
        };

      case 'step_started':
        return {
          title: `Executing: ${String(data.toolName ?? '')}`,
          toolName: String(data.toolName ?? ''),
          status: 'running',
          config: data.config,
        };

      case 'step_completed':
        return {
          title: `Completed: ${String(data.toolName ?? '')}`,
          toolName: String(data.toolName ?? ''),
          status: 'completed',
          durationMs: data.durationMs as number,
          tokensUsed: data.tokensUsed as {
            prompt: number;
            completion: number;
            total: number;
          },
          input: data.input,
          output: data.output,
          metadata: data.metadata,
          outputPreview: this.truncate(JSON.stringify(data.output ?? {}), 200),
        };

      case 'step_failed':
        return {
          title: `Failed: ${String(data.toolName ?? '')}`,
          toolName: String(data.toolName ?? ''),
          status: 'error',
          error: String((data.error as { message?: string })?.message ?? ''),
          durationMs: data.durationMs as number,
          input: data.input,
        };

      case 'replan_triggered':
        return {
          title: 'Re-planning',
          description: `Reason: ${String(data.reason ?? '')}`,
          status: 'running',
        };

      case 'replan_completed':
        return {
          title: 'Re-planning Complete',
          description: data.modified ? 'Plan was modified' : 'No changes',
        };

      case 'session_completed':
        return {
          title: 'Research Complete',
          status: 'completed',
          totalExecutionTime: data.totalExecutionTime as number,
        };

      case 'session_failed':
        return {
          title: 'Research Failed',
          status: 'error',
          error: String(data.reason ?? ''),
        };

      case 'milestone_started':
      case 'milestone_progress':
      case 'milestone_completed':
        return {
          title: String(data.formattedDescription ?? data.template ?? 'Processing...'),
          description: String(data.formattedDescription ?? ''),
          nodeId: String(data.nodeId ?? ''),
          milestoneId: String(data.milestoneId ?? ''),
          stage: data.stage as number,
          template: String(data.template ?? ''),
          templateData: data.templateData as Record<string, unknown>,
          progress: data.progress as number,
          status: entry.eventType === 'milestone_completed' ? 'completed' : 'running',
        };

      case 'tool.call.started':
        return {
          title: `Calling ${String(data.toolName ?? '')}`,
          toolName: String(data.toolName ?? ''),
          description: this.truncate(JSON.stringify(data.input ?? {}), 150),
          status: 'running',
          timestamp: new Date().toISOString(),
        };

      case 'tool.call.completed':
        return {
          title: `Completed ${String(data.toolName ?? '')}`,
          toolName: String(data.toolName ?? ''),
          status: 'completed',
          durationMs: data.durationMs as number,
          outputPreview: this.truncate(JSON.stringify(data.output ?? {}), 200),
          timestamp: new Date().toISOString(),
        };

      case 'tool.call.failed':
        return {
          title: `Failed ${String(data.toolName ?? '')}`,
          toolName: String(data.toolName ?? ''),
          status: 'error',
          error: String(
            (data.error as { message?: string })?.message ?? data.error ?? '',
          ),
          durationMs: data.durationMs as number,
          timestamp: new Date().toISOString(),
        };

      default:
        return { title: entry.eventType };
    }
  }

  private truncate(str: string, maxLen: number): string {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }
}
