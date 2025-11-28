/**
 * Evaluation models for research quality assessment
 */

export type EvaluationPhase = 'plan' | 'retrieval' | 'answer';

export type EvaluationStatus =
  | 'in_progress'
  | 'passed'
  | 'failed'
  | 'skipped';

/**
 * Scores for different evaluation criteria
 */
export interface EvaluationScores {
  intentAlignment?: number;
  queryCoverage?: number;
  scopeAppropriateness?: number;
  relevance?: number;
  completeness?: number;
  accuracy?: number;
  [key: string]: number | undefined;
}

/**
 * Complete evaluation result
 */
export interface EvaluationResult {
  phase: EvaluationPhase;
  status: EvaluationStatus;
  passed?: boolean;
  scores?: EvaluationScores;
  explanations?: { [key: string]: string };
  confidence?: number;
  totalIterations?: number;
  escalatedToLargeModel?: boolean;
  evaluationSkipped?: boolean;
  skipReason?: string;
  error?: string;
  timestamp?: string;
}

/**
 * Evaluation event from SSE
 */
export interface EvaluationEvent {
  eventType: 'evaluation_started' | 'evaluation_completed' | 'evaluation_failed';
  data: any;
}
