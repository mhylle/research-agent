export interface DimensionScores {
  [dimension: string]: number;
}

export interface PlanDimensionScores extends DimensionScores {
  intentAlignment: number;
  queryCoverage: number;
  scopeAppropriateness: number;
}

export interface RetrievalDimensionScores extends DimensionScores {
  contextRecall: number;
  contextPrecision: number;
  sourceQuality: number;
}

export interface AnswerDimensionScores extends DimensionScores {
  faithfulness: number;
  relevance: number;
  factualAccuracy: number;
  completeness: number;
  coherence: number;
}
