export interface ResearchQuery {
  query: string;
  options?: {
    maxSources?: number;
    searchDepth?: 'quick' | 'comprehensive';
  };
}
