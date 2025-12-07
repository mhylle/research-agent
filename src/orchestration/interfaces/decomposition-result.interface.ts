import { SubQuery } from './sub-query.interface';

export interface DecompositionResult {
  originalQuery: string;
  isComplex: boolean; // Whether decomposition was needed
  subQueries: SubQuery[];
  executionPlan: SubQuery[][]; // Grouped by execution phase
  reasoning: string; // Why this decomposition was chosen
}
