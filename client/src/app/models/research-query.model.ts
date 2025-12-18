export interface ResearchQuery {
  query: string;
  provider?: 'azure' | 'local';
  options?: {
    maxSources?: number;
    searchDepth?: 'quick' | 'comprehensive';
  };
}
