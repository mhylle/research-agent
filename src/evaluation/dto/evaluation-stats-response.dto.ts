export class EvaluationStatsResponseDto {
  totalEvaluations: number;
  passRate: number;
  avgScores: {
    overall: number;
    plan: number;
    retrieval: number;
    answer: number;
  };
  evaluationsByDate: Array<{
    date: string;
    count: number;
    passed: number;
    failed: number;
  }>;
  evaluationsByPhase: {
    plan: {
      total: number;
      passed: number;
      avgIterations: number;
      escalationRate: number;
    };
    retrieval: {
      total: number;
      passed: number;
      severeFlagRate: number;
    };
    answer: {
      total: number;
      passed: number;
      regenerationRate: number;
    };
  };
}
