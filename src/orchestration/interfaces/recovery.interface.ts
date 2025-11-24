// src/orchestration/interfaces/recovery.interface.ts
import { PlanStep } from './plan-step.interface';

export type RecoveryAction = 'retry' | 'skip' | 'alternative' | 'abort';

export interface RecoveryDecision {
  action: RecoveryAction;
  reason: string;
  modifications?: {
    retryWithConfig?: Record<string, any>;
    alternativeSteps?: PlanStep[];
  };
}

export interface FailureContext {
  planSummary: string;
  failedPhase: string;
  failedStep?: {
    stepId: string;
    toolName: string;
    config: any;
    error: {
      message: string;
      code?: string;
      stack?: string;
    };
  };
  completedSteps: string[];
  remainingPhases: string[];
}
