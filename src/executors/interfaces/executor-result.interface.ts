export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface ExecutorResult {
  output: any;
  tokensUsed?: TokenUsage;
  metadata?: Record<string, any>;
  durationMs?: number;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}
