// src/orchestration/interfaces/plan-step.interface.ts
export type StepType = 'tool_call' | 'llm_call';
export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface PlanStep {
  id: string;
  phaseId: string;
  type: StepType;
  toolName: string;
  config: Record<string, any>;
  dependencies: string[];
  status: StepStatus;
  order: number;
}
