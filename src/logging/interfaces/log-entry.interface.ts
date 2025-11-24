import { LogEventType } from './log-event-type.enum';

export interface LogEntryData {
  input?: any;
  output?: any;
  prompt?: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  durationMs?: number;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface LogEntry {
  id?: string;
  logId: string;
  timestamp: Date | string;
  eventType?: LogEventType;
  planId?: string;
  phaseId?: string;
  stepId?: string;
  data?: LogEntryData;
  // Winston log format fields
  stage?: number;
  operation?: string;
  component?: string;
  input?: any;
  output?: any;
  metadata?: any;
  executionTime?: number;
  level?: string;
  message?: string;
}

export type CreateLogEntry = Omit<LogEntry, 'id'>;
