import { SelfCritique } from './self-critique.interface';
import { Gap } from './gap.interface';

export interface Source {
  id: string;
  url: string;
  content: string;
  title?: string;
}

export interface RefinementContext {
  originalAnswer: string;
  critique: SelfCritique;
  gaps: Gap[];
  sources: Source[];
  iteration: number;
  previousAttempts: RefinementAttempt[];
}

export interface RefinementAttempt {
  iteration: number;
  refinedAnswer: string;
  improvement: number;
  addressedGaps: string[];
  remainingGaps: string[];
}

export interface RefinementResult {
  finalAnswer: string;
  refinementHistory: RefinementAttempt[];
  totalImprovement: number;
  gapsResolved: number;
  gapsRemaining: number;
}
