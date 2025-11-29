// src/orchestration/phase-executors/interfaces/phase-execution-context.ts
import { Plan } from '../../interfaces/plan.interface';
import { StepResult } from '../../interfaces/phase.interface';

/**
 * Context provided to phase executors during execution
 */
export interface PhaseExecutionContext {
  /** Unique identifier for the research session log */
  logId: string;

  /** The complete research plan */
  plan: Plan;

  /** Results from all previously executed steps across all phases */
  allPreviousResults: StepResult[];
}
