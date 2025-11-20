export interface ResearchResult {
  logId: string;
  query: string;              // Added by frontend
  answer: string;
  sources: Source[];
  metadata: ResultMetadata;
  timestamp: string;          // Added by frontend
}

export interface Source {
  url: string;
  title: string;
  relevance?: 'high' | 'medium' | 'low';
}

export interface ResultMetadata {
  totalExecutionTime: number;
  stages: StageMetadata[];
}

export interface StageMetadata {
  stage: number;
  executionTime: number;
}
