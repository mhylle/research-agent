import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LogEntry } from '../logging/interfaces/log-entry.interface';
import { LogSessionDto } from './dto/log-session.dto';
import { LogDetailDto } from './dto/log-detail.dto';
import { QuerySessionsDto } from './dto/query-sessions.dto';

interface SessionsResult {
  sessions: LogSessionDto[];
  total: number;
}

@Injectable()
export class LogsService {
  private readonly logFilePath: string;
  private sessionsCache: Map<string, LogSessionDto> = new Map();
  private cacheExpiry = 0;

  constructor(private configService: ConfigService) {
    const logDir = this.configService.get<string>('LOG_DIR') || './logs';
    this.logFilePath = path.join(logDir, 'research-combined.log');
  }

  async getAllSessions(options: QuerySessionsDto): Promise<SessionsResult> {
    // Check cache validity
    if (Date.now() < this.cacheExpiry && this.sessionsCache.size > 0) {
      return this.filterAndPaginate(Array.from(this.sessionsCache.values()), options);
    }

    // Read and parse log file
    const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());

    const entries: LogEntry[] = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (err) {
        console.error('Failed to parse log line:', line);
        return null;
      }
    }).filter(Boolean);

    // Group by logId
    const sessionsMap = new Map<string, LogEntry[]>();
    entries.forEach(entry => {
      if (!sessionsMap.has(entry.logId)) {
        sessionsMap.set(entry.logId, []);
      }
      sessionsMap.get(entry.logId).push(entry);
    });

    // Build session summaries
    const sessions: LogSessionDto[] = Array.from(sessionsMap.entries()).map(([logId, entries]) => {
      return this.buildSessionSummary(logId, entries);
    });

    // Update cache
    this.sessionsCache = new Map(sessions.map(s => [s.logId, s]));
    this.cacheExpiry = Date.now() + 60000;  // 60 second cache

    return this.filterAndPaginate(sessions, options);
  }

  async getSessionDetails(logId: string): Promise<LogDetailDto> {
    const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());

    const entries: LogEntry[] = lines
      .map(line => {
        try {
          const entry = JSON.parse(line);
          return entry.logId === logId ? entry : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (entries.length === 0) {
      throw new NotFoundException(`No logs found for logId: ${logId}`);
    }

    const session = this.buildSessionSummary(logId, entries);

    return {
      ...session,
      entries: entries.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ),
    };
  }

  private buildSessionSummary(logId: string, entries: LogEntry[]): LogSessionDto {
    const sortedEntries = entries.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Extract query from Stage 1 input
    const stage1Input = entries.find(e => e.stage === 1 && e.operation === 'stage_input');
    const query = stage1Input?.input?.query || 'Unknown query';

    // Calculate total duration
    const firstEntry = sortedEntries[0];
    const lastEntry = sortedEntries[sortedEntries.length - 1];
    const totalDuration = new Date(lastEntry.timestamp).getTime() - new Date(firstEntry.timestamp).getTime();

    // Count stages and tools
    const stageSet = new Set(entries.filter(e => e.stage).map(e => e.stage));
    const stageCount = stageSet.size;
    const toolCallCount = entries.filter(e => e.component !== 'pipeline').length;

    // Determine status
    const hasError = entries.some(e => e.operation === 'stage_error');
    const hasStage3Output = entries.some(e => e.stage === 3 && e.operation === 'stage_output');
    const status = hasError ? 'error' : (hasStage3Output ? 'completed' : 'incomplete');

    return {
      logId,
      query,
      timestamp: firstEntry.timestamp,
      totalDuration,
      stageCount,
      toolCallCount,
      status,
    };
  }

  private filterAndPaginate(sessions: LogSessionDto[], options: QuerySessionsDto): SessionsResult {
    let filtered = sessions;

    // Search filter
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(s =>
        s.query.toLowerCase().includes(searchLower) ||
        s.logId.includes(options.search)
      );
    }

    // Status filter
    if (options.status && options.status !== 'all') {
      filtered = filtered.filter(s => s.status === options.status);
    }

    // Date range filter
    if (options.from) {
      const fromDate = new Date(options.from);
      filtered = filtered.filter(s => new Date(s.timestamp) >= fromDate);
    }

    if (options.to) {
      const toDate = new Date(options.to);
      filtered = filtered.filter(s => new Date(s.timestamp) <= toDate);
    }

    // Sort by most recent first
    filtered.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Paginate
    const total = filtered.length;
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      sessions: paginated,
      total,
    };
  }
}
