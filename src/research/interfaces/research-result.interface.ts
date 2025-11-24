export interface ResearchResult {
  logId: string;
  planId: string;
  answer: string;
  sources: Array<{
    url: string;
    title: string;
    relevance: string;
  }>;
  metadata: {
    totalExecutionTime: number;
    phases: Array<{
      phase: string;
      executionTime: number;
    }>;
  };
}
