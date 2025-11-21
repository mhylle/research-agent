import { LogEntry } from '../../logging/interfaces/log-entry.interface';

export class LogDetailDto {
  logId: string;
  query: string;
  timestamp: string;
  totalDuration: number;
  status: 'completed' | 'error' | 'incomplete';
  entries: LogEntry[];
}
