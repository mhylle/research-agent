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
    toolLatency?: number;
    modelLatency?: number;
    toolName?: string;
    inputSize?: number;
    outputSize?: number;
    error?: string;
  };
}
