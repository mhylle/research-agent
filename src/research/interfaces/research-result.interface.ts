export interface ResearchResult {
  logId: string;
  answer: string;
  sources: Array<{
    url: string;
    title: string;
    relevance?: string;
  }>;
  metadata: {
    totalExecutionTime: number;
    stages: Array<{
      stage: number;
      executionTime: number;
    }>;
  };
}
