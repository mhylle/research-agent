export interface LogEntry {
  timestamp: string;
  logId: string;
  stage?: number;
  component: string;
  operation: string;
  input?: any;
  output?: any;
  executionTime?: number;
  metadata?: {
    model?: string;
    toolCalls?: number;
    tokensUsed?: number;
    error?: string;
  };
}
