// Confidence scoring interfaces (defined first as they're referenced by ResearchResult)
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
  methodology: {
    entailmentWeight: number;
    suScoreWeight: number;
    sourceCountWeight: number;
  };
  recommendations: string[];
}

// Main research result interfaces
export interface ResearchResult {
  logId: string;
  planId: string;
  query: string;              // Added by frontend
  answer: string;
  sources: Source[];
  metadata: ResultMetadata;
  timestamp: Date;            // Added by frontend
  confidence?: ConfidenceResult; // Optional confidence scoring
}

export interface Source {
  url: string;
  title: string;
  relevance: 'high' | 'medium' | 'low';
}

export interface ResultMetadata {
  totalExecutionTime: number;
  phases: PhaseMetadata[];
}

export interface PhaseMetadata {
  phase: string;
  executionTime: number;
}
