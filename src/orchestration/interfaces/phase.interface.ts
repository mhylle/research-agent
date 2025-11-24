// src/orchestration/interfaces/phase.interface.ts
import { PlanStep } from './plan-step.interface';

export type PhaseStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface Phase {
  id: string;
  planId: string;
  name: string;
  description?: string;
  status: PhaseStatus;
  steps: PlanStep[];
  replanCheckpoint: boolean;
  order: number;
}

export interface PhaseResult {
  status: 'completed' | 'failed';
  stepResults: StepResult[];
  error?: Error;
}

export interface StepResult {
  status: 'completed' | 'failed' | 'skipped';
  stepId: string;
  output?: any;
  error?: Error;
  input?: any;
}
