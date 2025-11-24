import { LogEventType } from './log-event-type.enum';

export interface LogQueryFilters {
  logId?: string;
  eventTypes?: LogEventType[];
  fromTime?: Date;
  toTime?: Date;
  stepId?: string;
  phaseId?: string;
  planId?: string;
  hasError?: boolean;
  limit?: number;
  offset?: number;
  order?: 'ASC' | 'DESC';
}

export interface SessionSummary {
  logId: string;
  startTime?: Date;
  endTime?: Date;
  totalDurationMs: number;
  totalTokens: number;
  phaseCount: number;
  stepCount: number;
  failureCount: number;
  replanCount: number;
  status: 'running' | 'completed' | 'failed';
}

export interface ExecutionMetrics {
  totalDurationMs: number;
  tokenBreakdown: Record<string, number>;
  durationByPhase: Record<string, number>;
  durationByTool: Record<string, number>;
  slowestSteps: Array<{ stepId: string; durationMs: number; toolName: string }>;
  tokenHeavySteps: Array<{ stepId: string; tokens: number; toolName: string }>;
}
