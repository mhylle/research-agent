export interface ResearchStatus {
  isResearching: boolean;
  currentLogId?: string;
  queuedQueries: string[];
}
