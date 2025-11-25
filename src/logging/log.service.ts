// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { LogEntryEntity } from './entities/log-entry.entity';
import { LogEntry, CreateLogEntry } from './interfaces/log-entry.interface';
import {
  LogQueryFilters,
  SessionSummary,
  ExecutionMetrics,
} from './interfaces/log-query.interface';
import { LogEventType } from './interfaces/log-event-type.enum';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(LogEntryEntity)
    private logRepository: Repository<LogEntryEntity>,
    private eventEmitter: EventEmitter2,
  ) {
    // Listen for tool_call events and persist them to the database
    this.setupToolCallListeners();
  }

  private setupToolCallListeners(): void {
    // Listen for tool.call.started events
    this.eventEmitter.on(
      'tool.call.started',
      (eventData: {
        logId?: string;
        stepId?: string;
        phaseId?: string;
        toolName: string;
        input: string;
        timestamp: Date;
      }) => {
        if (eventData.logId) {
          void this.append({
            logId: eventData.logId,
            eventType: 'step_started',
            stepId: eventData.stepId,
            phaseId: eventData.phaseId,
            data: {
              toolName: eventData.toolName,
              input: eventData.input,
              timestamp: eventData.timestamp,
            },
          });
        }
      },
    );

    // Listen for tool.call.completed events
    this.eventEmitter.on(
      'tool.call.completed',
      (eventData: {
        logId?: string;
        stepId?: string;
        phaseId?: string;
        toolName: string;
        input: string;
        output: string;
        durationMs: number;
        timestamp: Date;
      }) => {
        if (eventData.logId) {
          void this.append({
            logId: eventData.logId,
            eventType: 'step_completed',
            stepId: eventData.stepId,
            phaseId: eventData.phaseId,
            data: {
              toolName: eventData.toolName,
              input: eventData.input,
              output: eventData.output,
              durationMs: eventData.durationMs,
              timestamp: eventData.timestamp,
            },
          });
        }
      },
    );

    // Listen for tool.call.failed events
    this.eventEmitter.on(
      'tool.call.failed',
      (eventData: {
        logId?: string;
        stepId?: string;
        phaseId?: string;
        toolName: string;
        input: string;
        error: string;
        durationMs: number;
        timestamp: Date;
      }) => {
        if (eventData.logId) {
          void this.append({
            logId: eventData.logId,
            eventType: 'step_failed',
            stepId: eventData.stepId,
            phaseId: eventData.phaseId,
            data: {
              toolName: eventData.toolName,
              input: eventData.input,
              error: eventData.error,
              durationMs: eventData.durationMs,
              timestamp: eventData.timestamp,
            },
          });
        }
      },
    );
  }

  async append(entry: CreateLogEntry): Promise<LogEntry> {
    const logEntry: LogEntry = {
      id: randomUUID(),
      ...entry,
      timestamp: entry.timestamp || new Date(),
    };

    await this.logRepository.insert(this.toEntity(logEntry));

    this.eventEmitter.emit(`log.${entry.logId}`, logEntry);
    this.eventEmitter.emit('log.all', logEntry);

    return logEntry;
  }

  async getSessionLogs(logId: string): Promise<LogEntry[]> {
    const entities = await this.logRepository.find({
      where: { logId },
      order: { timestamp: 'ASC' },
    });
    return entities.map((e) => this.fromEntity(e));
  }

  async getSessionSummary(logId: string): Promise<SessionSummary> {
    const logs = await this.getSessionLogs(logId);

    return {
      logId,
      startTime: logs[0]?.timestamp,
      endTime: logs[logs.length - 1]?.timestamp,
      totalDurationMs: this.calculateDuration(logs),
      totalTokens: this.sumTokens(logs),
      phaseCount: this.countEvents(logs, ['phase_completed']),
      stepCount: this.countEvents(logs, ['step_completed']),
      failureCount: this.countEvents(logs, ['step_failed', 'phase_failed']),
      replanCount: this.countEvents(logs, ['replan_triggered']),
      status: this.deriveStatus(logs),
    };
  }

  async queryLogs(filters: LogQueryFilters): Promise<LogEntry[]> {
    const query = this.logRepository.createQueryBuilder('log');

    if (filters.logId) {
      query.andWhere('log.logId = :logId', { logId: filters.logId });
    }
    if (filters.eventTypes?.length) {
      query.andWhere('log.eventType IN (:...types)', {
        types: filters.eventTypes,
      });
    }
    if (filters.fromTime) {
      query.andWhere('log.timestamp >= :from', { from: filters.fromTime });
    }
    if (filters.toTime) {
      query.andWhere('log.timestamp <= :to', { to: filters.toTime });
    }
    if (filters.stepId) {
      query.andWhere('log.stepId = :stepId', { stepId: filters.stepId });
    }
    if (filters.phaseId) {
      query.andWhere('log.phaseId = :phaseId', { phaseId: filters.phaseId });
    }
    if (filters.hasError) {
      query.andWhere("log.data->>'error' IS NOT NULL");
    }

    query.orderBy('log.timestamp', filters.order || 'ASC');

    if (filters.limit) {
      query.limit(filters.limit);
    }
    if (filters.offset) {
      query.offset(filters.offset);
    }

    const entities = await query.getMany();
    return entities.map((e) => this.fromEntity(e));
  }

  async getExecutionMetrics(logId: string): Promise<ExecutionMetrics> {
    const logs = await this.getSessionLogs(logId);
    const stepLogs = logs.filter((l) => l.eventType === 'step_completed');

    return {
      totalDurationMs: this.calculateDuration(logs),
      tokenBreakdown: this.aggregateTokensByStep(stepLogs),
      durationByPhase: this.aggregateDurationByPhase(logs),
      durationByTool: this.aggregateDurationByTool(stepLogs),
      slowestSteps: this.findSlowestSteps(stepLogs, 5),
      tokenHeavySteps: this.findTokenHeavySteps(stepLogs, 5),
    };
  }

  private toEntity(entry: LogEntry): LogEntryEntity {
    const entity = new LogEntryEntity();
    entity.id = entry.id;
    entity.logId = entry.logId;
    entity.timestamp = entry.timestamp;
    entity.eventType = entry.eventType;
    entity.planId = entry.planId;
    entity.phaseId = entry.phaseId;
    entity.stepId = entry.stepId;
    entity.data = entry.data;
    return entity;
  }

  private fromEntity(entity: LogEntryEntity): LogEntry {
    return {
      id: entity.id,
      logId: entity.logId,
      timestamp: entity.timestamp,
      eventType: entity.eventType as LogEventType,
      planId: entity.planId,
      phaseId: entity.phaseId,
      stepId: entity.stepId,
      data: entity.data,
    };
  }

  private calculateDuration(logs: LogEntry[]): number {
    if (logs.length < 2) return 0;
    const start = logs[0].timestamp.getTime();
    const end = logs[logs.length - 1].timestamp.getTime();
    return end - start;
  }

  private sumTokens(logs: LogEntry[]): number {
    return logs.reduce((sum, log) => {
      return sum + (log.data.tokensUsed?.total || 0);
    }, 0);
  }

  private countEvents(logs: LogEntry[], eventTypes: string[]): number {
    return logs.filter((l) => eventTypes.includes(l.eventType)).length;
  }

  private deriveStatus(logs: LogEntry[]): 'running' | 'completed' | 'failed' {
    const lastEvent = logs[logs.length - 1];
    if (!lastEvent) return 'running';
    if (lastEvent.eventType === 'session_completed') return 'completed';
    if (lastEvent.eventType === 'session_failed') return 'failed';
    return 'running';
  }

  private aggregateTokensByStep(logs: LogEntry[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const log of logs) {
      const toolName = String(
        log.data.metadata?.toolName || log.data.toolName || 'unknown',
      );
      const tokens = Number(log.data.tokensUsed?.total || 0);
      result[toolName] = (result[toolName] || 0) + tokens;
    }
    return result;
  }

  private aggregateDurationByPhase(logs: LogEntry[]): Record<string, number> {
    const result: Record<string, number> = {};
    const phaseStarts: Record<string, number> = {};

    for (const log of logs) {
      if (log.eventType === 'phase_started' && log.phaseId) {
        phaseStarts[log.phaseId] = log.timestamp.getTime();
      }
      if (
        (log.eventType === 'phase_completed' ||
          log.eventType === 'phase_failed') &&
        log.phaseId
      ) {
        const start = phaseStarts[log.phaseId];
        if (start) {
          const phaseName = String(log.data.phaseName || log.phaseId);
          result[phaseName] = log.timestamp.getTime() - start;
        }
      }
    }
    return result;
  }

  private aggregateDurationByTool(logs: LogEntry[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const log of logs) {
      const toolName = String(
        log.data.metadata?.toolName || log.data.toolName || 'unknown',
      );
      const duration = Number(log.data.durationMs || 0);
      result[toolName] = (result[toolName] || 0) + duration;
    }
    return result;
  }

  private findSlowestSteps(
    logs: LogEntry[],
    limit: number,
  ): Array<{ stepId: string; durationMs: number; toolName: string }> {
    return logs
      .filter((l) => l.data.durationMs)
      .map((l) => ({
        stepId: l.stepId || 'unknown',
        durationMs: Number(l.data.durationMs || 0),
        toolName: String(
          l.data.metadata?.toolName || l.data.toolName || 'unknown',
        ),
      }))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, limit);
  }

  private findTokenHeavySteps(
    logs: LogEntry[],
    limit: number,
  ): Array<{ stepId: string; tokens: number; toolName: string }> {
    return logs
      .filter((l) => l.data.tokensUsed?.total)
      .map((l) => ({
        stepId: l.stepId || 'unknown',
        tokens: Number(l.data.tokensUsed?.total || 0),
        toolName: String(
          l.data.metadata?.toolName || l.data.toolName || 'unknown',
        ),
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, limit);
  }
}
