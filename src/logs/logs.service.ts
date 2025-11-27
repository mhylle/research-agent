import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogEntryEntity } from '../logging/entities/log-entry.entity';
import { ResearchResultEntity } from '../research/entities/research-result.entity';
import { LogSessionDto } from './dto/log-session.dto';
import { LogDetailDto } from './dto/log-detail.dto';
import { QuerySessionsDto } from './dto/query-sessions.dto';
import {
  GraphData,
  GraphNode,
  GraphEdge,
} from '../research/interfaces/graph-node.interface';
import { LogEntry } from '../logging/interfaces/log-entry.interface';
import { LogEventType } from '../logging/interfaces/log-event-type.enum';

export interface SessionsResult {
  sessions: LogSessionDto[];
  total: number;
}

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(LogEntryEntity)
    private logRepository: Repository<LogEntryEntity>,
    @InjectRepository(ResearchResultEntity)
    private resultRepository: Repository<ResearchResultEntity>,
  ) {}

  async getAllSessions(options: QuerySessionsDto): Promise<SessionsResult> {
    // Get distinct logIds with their session info
    const subQuery = this.logRepository
      .createQueryBuilder('log')
      .select('DISTINCT log.logId', 'logId');

    const logIds = await subQuery.getRawMany();

    // Build session summaries
    const sessions: LogSessionDto[] = await Promise.all(
      logIds.map(async ({ logId }) => {
        const entries = await this.getEntriesForLogId(logId);
        return this.buildSessionSummary(logId, entries);
      }),
    );

    return this.filterAndPaginate(sessions, options);
  }

  async getSessionDetails(logId: string): Promise<LogDetailDto> {
    const entries = await this.getEntriesForLogId(logId);

    if (entries.length === 0) {
      throw new NotFoundException(`No logs found for logId: ${logId}`);
    }

    const session = this.buildSessionSummary(logId, entries);

    // Fetch the research result if available
    const researchResult = await this.resultRepository.findOne({
      where: { logId },
    });

    const result: LogDetailDto = {
      ...session,
      entries: entries.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    };

    // Include research result if found
    if (researchResult) {
      result.result = {
        answer: researchResult.answer,
        sources: researchResult.sources,
        metadata: researchResult.metadata,
      };
    }

    return result;
  }

  private async getEntriesForLogId(logId: string): Promise<LogEntry[]> {
    const entities = await this.logRepository.find({
      where: { logId },
      order: { timestamp: 'ASC' },
    });

    return entities.map((entity) => this.fromEntity(entity));
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

  private buildSessionSummary(
    logId: string,
    entries: LogEntry[],
  ): LogSessionDto {
    const sortedEntries = entries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    // Extract query from session_started event
    const sessionStarted = entries.find(
      (e) => e.eventType === 'session_started',
    );
    const query = (sessionStarted?.data?.query as string) || 'Unknown query';

    // Calculate total duration
    const firstEntry = sortedEntries[0];
    const lastEntry = sortedEntries[sortedEntries.length - 1];
    const totalDuration =
      firstEntry && lastEntry
        ? new Date(lastEntry.timestamp).getTime() -
          new Date(firstEntry.timestamp).getTime()
        : 0;

    // Count phases and steps
    const phaseCount = entries.filter(
      (e) => e.eventType === 'phase_completed',
    ).length;
    const stepCount = entries.filter(
      (e) => e.eventType === 'step_completed',
    ).length;

    // Determine status based on events
    const hasError = entries.some(
      (e) =>
        e.eventType === 'session_failed' ||
        e.eventType === 'step_failed' ||
        e.eventType === 'phase_failed',
    );
    const hasCompletion = entries.some(
      (e) => e.eventType === 'session_completed',
    );
    const status = hasError
      ? 'error'
      : hasCompletion
        ? 'completed'
        : 'incomplete';

    return {
      logId,
      query,
      timestamp:
        typeof firstEntry?.timestamp === 'string'
          ? firstEntry.timestamp
          : firstEntry?.timestamp?.toISOString() || new Date().toISOString(),
      totalDuration,
      stageCount: phaseCount,
      toolCallCount: stepCount,
      status,
    };
  }

  async getGraphData(logId: string): Promise<GraphData> {
    const detail = await this.getSessionDetails(logId);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Create root session node
    const sessionNode: GraphNode = {
      id: `session-${logId}`,
      type: 'stage',
      name: 'Research Session',
      icon: '🔬',
      color: '#6366f1',
      size: 'large',
      startTime: new Date(detail.timestamp),
      status:
        detail.status === 'completed'
          ? 'completed'
          : detail.status === 'error'
            ? 'error'
            : 'running',
      childrenIds: [],
      dependsOn: [],
    };
    nodes.push(sessionNode);
    nodeMap.set(sessionNode.id, sessionNode);

    // Process planning phase first
    const planCreatedEntry = detail.entries.find(
      (e) => e.eventType === 'plan_created',
    );
    const planningStartedEntry = detail.entries.find(
      (e) => e.eventType === 'planning_started',
    );

    if (planCreatedEntry || planningStartedEntry) {
      const startTime = planningStartedEntry
        ? new Date(planningStartedEntry.timestamp)
        : new Date(detail.timestamp);
      const endTime = planCreatedEntry
        ? new Date(planCreatedEntry.timestamp)
        : startTime;

      const planningNode: GraphNode = {
        id: `planning-${logId}`,
        type: 'stage',
        name: 'Planning Phase',
        icon: '🧠',
        color: '#8b5cf6',
        size: 'medium',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        status: planCreatedEntry ? 'completed' : 'running',
        parentId: sessionNode.id,
        childrenIds: [],
        dependsOn: [],
        input: planningStartedEntry?.data || {},
        output: planCreatedEntry?.data || {},
      };

      nodes.push(planningNode);
      nodeMap.set(planningNode.id, planningNode);
      sessionNode.childrenIds.push(planningNode.id);

      edges.push({
        id: `${sessionNode.id}-${planningNode.id}`,
        source: sessionNode.id,
        target: planningNode.id,
        type: 'parent-child',
      });
    }

    // Process entries to build phase and step nodes
    const phaseNodes = new Map<string, GraphNode>();

    detail.entries.forEach((entry) => {
      // Handle phase events
      if (entry.eventType === 'phase_added' && entry.phaseId) {
        const phaseNode: GraphNode = {
          id: `phase-${entry.phaseId}`,
          type: 'stage',
          name: (entry.data?.name as string) || 'Phase',
          icon: '⚙️',
          color: '#3b82f6',
          size: 'medium',
          startTime: new Date(entry.timestamp),
          status: 'pending',
          parentId: sessionNode.id,
          childrenIds: [],
          dependsOn: [],
          input: entry.data,
        };
        phaseNodes.set(entry.phaseId, phaseNode);
        nodes.push(phaseNode);
        nodeMap.set(phaseNode.id, phaseNode);
        sessionNode.childrenIds.push(phaseNode.id);

        edges.push({
          id: `${sessionNode.id}-${phaseNode.id}`,
          source: sessionNode.id,
          target: phaseNode.id,
          type: 'parent-child',
        });
      }

      // Handle phase start
      if (entry.eventType === 'phase_started' && entry.phaseId) {
        const phaseNode = phaseNodes.get(entry.phaseId);
        if (phaseNode) {
          phaseNode.status = 'running';
          phaseNode.startTime = new Date(entry.timestamp);
        }
      }

      // Handle phase completion
      if (
        (entry.eventType === 'phase_completed' ||
          entry.eventType === 'phase_failed') &&
        entry.phaseId
      ) {
        const phaseNode = phaseNodes.get(entry.phaseId);
        if (phaseNode) {
          phaseNode.status =
            entry.eventType === 'phase_completed' ? 'completed' : 'error';
          phaseNode.endTime = new Date(entry.timestamp);
          phaseNode.output = entry.data?.output || entry.data;
          if (phaseNode.startTime) {
            phaseNode.duration =
              phaseNode.endTime.getTime() - phaseNode.startTime.getTime();
          }
        }
      }

      // Handle step events
      if (entry.eventType === 'step_started' && entry.stepId) {
        // Check if node already exists (to handle duplicate step_started events)
        const existingNode = nodeMap.get(`step-${entry.stepId}`);
        if (existingNode) {
          // Update existing node with config if provided (prefer config over input)
          if (entry.data?.config && !existingNode.input) {
            existingNode.input = entry.data.config;
          }
          // Skip creating duplicate node
          return;
        }

        const parentPhase = entry.phaseId
          ? phaseNodes.get(entry.phaseId)
          : null;
        const stepNode: GraphNode = {
          id: `step-${entry.stepId}`,
          type: 'tool',
          name: (entry.data?.toolName as string) || 'Step',
          icon: '🔧',
          color: '#10b981',
          size: 'small',
          startTime: new Date(entry.timestamp),
          status: 'running',
          parentId: parentPhase?.id || sessionNode.id,
          childrenIds: [],
          dependsOn: [],
          input: entry.data?.config || entry.data?.input,
        };
        nodes.push(stepNode);
        nodeMap.set(stepNode.id, stepNode);

        if (parentPhase) {
          parentPhase.childrenIds.push(stepNode.id);
          edges.push({
            id: `${parentPhase.id}-${stepNode.id}`,
            source: parentPhase.id,
            target: stepNode.id,
            type: 'parent-child',
          });
        }
      }

      // Handle step completion
      if (
        (entry.eventType === 'step_completed' ||
          entry.eventType === 'step_failed') &&
        entry.stepId
      ) {
        let stepNode = nodeMap.get(`step-${entry.stepId}`);

        // If node doesn't exist (missed step_started), create it now
        if (!stepNode) {
          const parentPhase = entry.phaseId
            ? phaseNodes.get(entry.phaseId)
            : null;
          stepNode = {
            id: `step-${entry.stepId}`,
            type: 'tool',
            name: (entry.data?.toolName as string) || 'Step',
            icon: '🔧',
            color: '#10b981',
            size: 'small',
            startTime: new Date(entry.timestamp), // Use completion time as best guess
            status: 'running',
            parentId: parentPhase?.id || sessionNode.id,
            childrenIds: [],
            dependsOn: [],
            input: entry.data?.input || entry.data?.config,
          };
          nodes.push(stepNode);
          nodeMap.set(stepNode.id, stepNode);

          if (parentPhase) {
            parentPhase.childrenIds.push(stepNode.id);
            edges.push({
              id: `${parentPhase.id}-${stepNode.id}`,
              source: parentPhase.id,
              target: stepNode.id,
              type: 'parent-child',
            });
          }
        }

        // Update the node with completion data
        stepNode.status =
          entry.eventType === 'step_completed' ? 'completed' : 'error';
        stepNode.endTime = new Date(entry.timestamp);

        // Prefer entry.data.input if it's a non-string object, otherwise keep existing input
        // This handles the case where tool executor sends truncated strings
        if (entry.data?.input) {
          if (typeof entry.data.input === 'string') {
            // Try to parse string input (from tool executor)
            try {
              const parsed = JSON.parse(entry.data.input);
              stepNode.input = parsed;
            } catch {
              // If parsing fails, only use string if we don't have input yet
              if (!stepNode.input) {
                stepNode.input = entry.data.input;
              }
            }
          } else {
            // Use object input directly (from orchestrator)
            stepNode.input = entry.data.input;
          }
        }

        // Handle output similarly
        if (entry.data?.output) {
          if (typeof entry.data.output === 'string') {
            try {
              const parsed = JSON.parse(entry.data.output);
              stepNode.output = parsed;
            } catch {
              // If parsing fails, use string as-is
              stepNode.output = entry.data.output;
            }
          } else {
            stepNode.output = entry.data.output;
          }
        }

        if (stepNode.startTime) {
          stepNode.duration =
            stepNode.endTime.getTime() - stepNode.startTime.getTime();
        }
        if (entry.data?.durationMs) {
          stepNode.metrics = {
            ...stepNode.metrics,
            toolLatency: entry.data.durationMs,
          };
        }
      }
    });

    // Update session node end time
    if (detail.entries.length > 0) {
      const lastEntry = detail.entries[detail.entries.length - 1];
      sessionNode.endTime = new Date(lastEntry.timestamp);
      sessionNode.duration = detail.totalDuration;
    }

    // Calculate metadata
    const times = nodes
      .filter((n) => n.startTime)
      .map((n) => n.startTime.getTime());
    const endTimes = nodes
      .filter((n) => n.endTime)
      .map((n) => n.endTime!.getTime());

    return {
      nodes,
      edges,
      metadata: {
        startTime: times.length > 0 ? new Date(Math.min(...times)) : undefined,
        endTime:
          endTimes.length > 0 ? new Date(Math.max(...endTimes)) : undefined,
        totalDuration: detail.totalDuration,
      },
    };
  }

  private filterAndPaginate(
    sessions: LogSessionDto[],
    options: QuerySessionsDto,
  ): SessionsResult {
    let filtered = sessions;

    // Search filter
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.query.toLowerCase().includes(searchLower) ||
          s.logId.toLowerCase().includes(searchLower),
      );
    }

    // Status filter
    if (options.status && options.status !== 'all') {
      filtered = filtered.filter((s) => s.status === options.status);
    }

    // Date range filter
    if (options.from) {
      const fromDate = new Date(options.from);
      filtered = filtered.filter((s) => new Date(s.timestamp) >= fromDate);
    }

    if (options.to) {
      const toDate = new Date(options.to);
      filtered = filtered.filter((s) => new Date(s.timestamp) <= toDate);
    }

    // Sort by most recent first
    filtered.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
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
