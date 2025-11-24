// src/orchestration/interfaces/plan.interface.ts
import { Phase } from './phase.interface';

export type PlanStatus =
  | 'planning'
  | 'executing'
  | 'replanning'
  | 'completed'
  | 'failed';

export interface Plan {
  id: string;
  query: string;
  status: PlanStatus;
  phases: Phase[];
  createdAt: Date;
  completedAt?: Date;
}
