export interface ExecutionMetrics {
  totalDurationMs: number;
  tokenBreakdown: Record<string, number>;
  durationByPhase: Record<string, number>;
  durationByTool: Record<string, number>;
  slowestSteps: StepMetric[];
  tokenHeavySteps: TokenMetric[];
}

export interface StepMetric {
  stepId: string;
  durationMs: number;
  toolName: string;
}

export interface TokenMetric {
  stepId: string;
  tokens: number;
  toolName: string;
}
