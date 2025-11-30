export interface DimensionScores {
  [dimension: string]: number;
}

export interface PlanDimensionScores extends DimensionScores {
  intentAlignment: number;
  queryCoverage: number;
  queryAccuracy: number;
  scopeAppropriateness: number;
}

export interface RetrievalDimensionScores extends DimensionScores {
  contextRecall: number;
  contextPrecision: number;
  sourceQuality: number;
  actionableInformation: number;
}

export interface AnswerDimensionScores extends DimensionScores {
  faithfulness: number;
  answerRelevance: number;
  completeness: number;
  accuracy: number;
}
