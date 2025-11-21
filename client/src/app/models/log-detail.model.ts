export interface LogEntry {
  timestamp: string;
  logId: string;
  stage?: number;
  component: string;
  operation: string;
  input?: any;
  output?: any;
  executionTime?: number;
  level: string;
  message: string;
}

export interface LogDetail {
  logId: string;
  query: string;
  timestamp: string;
  totalDuration: number;
  status: 'completed' | 'error' | 'incomplete';
  entries: LogEntry[];
}
