import { LogEntry } from '../../logging/interfaces/log-entry.interface';

export interface ResearchSource {
  url: string;
  title: string;
  relevance: string;
}

export interface ResearchMetadata {
  totalExecutionTime: number;
  phases: Array<{ phase: string; executionTime: number }>;
}

export interface ResearchResultData {
  answer: string;
  sources: ResearchSource[];
  metadata: ResearchMetadata;
}

export class LogDetailDto {
  logId: string;
  query: string;
  timestamp: string;
  totalDuration: number;
  status: 'completed' | 'error' | 'incomplete';
  entries: LogEntry[];
  result?: ResearchResultData;
}
