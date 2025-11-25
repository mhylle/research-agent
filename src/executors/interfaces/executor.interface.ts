import { PlanStep } from '../../orchestration/interfaces/plan-step.interface';
import { ExecutorResult } from './executor-result.interface';

export interface Executor {
  execute(step: PlanStep, logId?: string): Promise<ExecutorResult>;
}
