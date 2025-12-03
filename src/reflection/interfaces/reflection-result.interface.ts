import { Gap } from './gap.interface';

export interface ReflectionStep {
  iteration: number;
  critique: string;
  gapsFound: Gap[];
  confidenceBefore: number;
  confidenceAfter: number;
  improvement: number;
}

export interface ReflectionResult {
  iterationCount: number;
  improvements: number[];
  identifiedGaps: Gap[];
  finalAnswer: string;
  finalConfidence: number;
  reflectionTrace: ReflectionStep[];
}
