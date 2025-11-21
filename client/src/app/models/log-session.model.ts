export interface LogSession {
  logId: string;
  query: string;
  timestamp: string;
  totalDuration: number;
  stageCount: number;
  toolCallCount: number;
  status: 'completed' | 'error' | 'incomplete';
}

export interface SessionsResponse {
  sessions: LogSession[];
  total: number;
}
