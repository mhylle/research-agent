export class LogSessionDto {
  logId: string;
  query: string;
  timestamp: string;
  totalDuration: number;
  stageCount: number;
  toolCallCount: number;
  status: 'completed' | 'error' | 'incomplete';
}
