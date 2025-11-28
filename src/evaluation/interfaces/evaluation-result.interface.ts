import { DimensionScores } from './dimension-scores.interface';

export interface EvaluatorResult {
  role: string;
  model: string;
  dimensions: string[];
  scores: DimensionScores;
  confidence: number;
  explanation?: string;
  critique: string;
  rawResponse: string;
  latency: number;
  tokensUsed: number;
}

export interface EscalationResult {
  trigger: 'low_confidence' | 'disagreement' | 'borderline';
  model: string;
  panelReview: string;
  trustDecisions: Record<string, number>;
  finalVerdict: string;
  scores: DimensionScores;
  latency: number;
  tokensUsed: number;
}

export interface IterationDecision {
  mode: 'targeted_fix' | 'full_regeneration' | 'alternative_approach';
  specificIssues: Array<{ issue: string; fix: string }>;
  feedbackToPlanner: string;
}

export interface PlanAttempt {
  attemptNumber: number;
  timestamp: Date;
  plan: any;
  evaluatorResults: EvaluatorResult[];
  aggregatedScores: DimensionScores;
  aggregatedConfidence: number;
  passed: boolean;
  escalation?: EscalationResult;
  iterationDecision?: IterationDecision;
}

export interface EvaluationResult {
  passed: boolean;
  scores: DimensionScores;
  explanations?: Record<string, string>;
  confidence: number;
  critique?: string;
  evaluationSkipped: boolean;
  skipReason?: string;
}

export interface PlanEvaluationResult extends EvaluationResult {
  attempts: PlanAttempt[];
  totalIterations: number;
  escalatedToLargeModel: boolean;
}
