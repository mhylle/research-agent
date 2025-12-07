import { QueryAspect } from './query-aspect.interface';

export interface SuggestedRetrieval {
  aspect: string;
  searchQuery: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
}

export interface CoverageResult {
  overallCoverage: number; // 0-1, percentage of query aspects covered
  aspectsCovered: QueryAspect[];
  aspectsMissing: QueryAspect[];
  suggestedRetrievals: SuggestedRetrieval[];
  isComplete: boolean; // Whether coverage threshold met
}
