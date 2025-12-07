export interface WordUncertainty {
  word: string;
  importance: number;
  uncertainty: number;
  contribution: number;
}

export interface ClaimSUScore {
  claimId: string;
  score: number;
  wordBreakdown: WordUncertainty[];
}

export interface SUScoreResult {
  overallScore: number;
  claimScores: ClaimSUScore[];
  methodology: string;
}

export interface ConfidenceMethodology {
  entailmentWeight: number;
  suScoreWeight: number;
  sourceCountWeight: number;
}

export interface ClaimConfidence {
  claimId: string;
  claimText: string;
  confidence: number;
  level: 'high' | 'medium' | 'low' | 'very_low';
  entailmentScore: number;
  suScore: number;
  supportingSources: number;
}

export interface ConfidenceResult {
  overallConfidence: number;
  level: 'high' | 'medium' | 'low' | 'very_low';
  claimConfidences: ClaimConfidence[];
  methodology: ConfidenceMethodology;
  recommendations: string[];
}
