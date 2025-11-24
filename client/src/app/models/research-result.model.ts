export interface ResearchResult {
  logId: string;
  planId: string;
  query: string;              // Added by frontend
  answer: string;
  sources: Source[];
  metadata: ResultMetadata;
  timestamp: Date;            // Added by frontend
}

export interface Source {
  url: string;
  title: string;
  relevance: 'high' | 'medium' | 'low';
}

export interface ResultMetadata {
  totalExecutionTime: number;
  phases: PhaseMetadata[];
}

export interface PhaseMetadata {
  phase: string;
  executionTime: number;
}
