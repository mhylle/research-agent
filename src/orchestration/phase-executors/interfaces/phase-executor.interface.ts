// src/orchestration/phase-executors/interfaces/phase-executor.interface.ts
import { Phase, PhaseResult } from '../../interfaces/phase.interface';
import { PhaseExecutionContext } from './phase-execution-context';

/**
 * Interface for phase executors.
 * Each executor handles specific types of phases and manages their execution lifecycle.
 */
export interface IPhaseExecutor {
  /**
   * Determines if this executor can handle the given phase
   * @param phase The phase to check
   * @returns true if this executor can handle the phase
   */
  canHandle(phase: Phase): boolean;

  /**
   * Executes the phase and returns the result
   * @param phase The phase to execute
   * @param context Execution context with plan and previous results
   * @returns Promise resolving to the phase execution result
   */
  execute(phase: Phase, context: PhaseExecutionContext): Promise<PhaseResult>;
}
