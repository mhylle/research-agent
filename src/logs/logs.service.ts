import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LogEntry } from '../logging/interfaces/log-entry.interface';
import { LogSessionDto } from './dto/log-session.dto';
import { LogDetailDto } from './dto/log-detail.dto';
import { QuerySessionsDto } from './dto/query-sessions.dto';
import {
  GraphData,
  GraphNode,
  GraphEdge,
} from '../research/interfaces/graph-node.interface';

export interface SessionsResult {
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
      return this.filterAndPaginate(
        Array.from(this.sessionsCache.values()),
        options,
      );
    }

    // Read and parse log file
    const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
    const lines = fileContent.split('\n').filter((line) => line.trim());

    const entries: LogEntry[] = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          console.error('Failed to parse log line:', line);
          return null;
        }
      })
      .filter(Boolean);

    // Group by logId
    const sessionsMap = new Map<string, LogEntry[]>();
    entries.forEach((entry) => {
      if (!sessionsMap.has(entry.logId)) {
        sessionsMap.set(entry.logId, []);
      }
      sessionsMap.get(entry.logId)!.push(entry);
    });

    // Build session summaries
    const sessions: LogSessionDto[] = Array.from(sessionsMap.entries()).map(
      ([logId, entries]) => {
        return this.buildSessionSummary(logId, entries);
      },
    );

    // Update cache
    this.sessionsCache = new Map(sessions.map((s) => [s.logId, s]));
    this.cacheExpiry = Date.now() + 60000; // 60 second cache

    return this.filterAndPaginate(sessions, options);
  }

  async getSessionDetails(logId: string): Promise<LogDetailDto> {
    const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
    const lines = fileContent.split('\n').filter((line) => line.trim());

    const entries: LogEntry[] = lines
      .map((line) => {
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
      entries: entries.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
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

    // Extract query from Stage 1 input
    const stage1Input = entries.find(
      (e) => e.stage === 1 && e.operation === 'stage_input',
    );
    const query = stage1Input?.input?.query || 'Unknown query';

    // Calculate total duration
    const firstEntry = sortedEntries[0];
    const lastEntry = sortedEntries[sortedEntries.length - 1];
    const totalDuration =
      new Date(lastEntry.timestamp).getTime() -
      new Date(firstEntry.timestamp).getTime();

    // Count stages and tools
    const stageSet = new Set(
      entries.filter((e) => e.stage).map((e) => e.stage),
    );
    const stageCount = stageSet.size;
    const toolCallCount = entries.filter(
      (e) => e.component !== 'pipeline',
    ).length;

    // Determine status
    const hasError = entries.some((e) => e.operation === 'stage_error');
    const hasStage3Output = entries.some(
      (e) => e.stage === 3 && e.operation === 'stage_output',
    );
    const status = hasError
      ? 'error'
      : hasStage3Output
        ? 'completed'
        : 'incomplete';

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

  async getGraphData(logId: string): Promise<GraphData> {
    const detail = await this.getSessionDetails(logId);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Process entries to build nodes
    detail.entries.forEach((entry, index) => {
      const nodeId = `${entry.component}-${entry.stage || index}`;

      let nodeType: 'stage' | 'tool' | 'llm' | 'retry' = 'stage';
      if (entry.component === 'llm') {
        nodeType = 'llm';
      } else if (entry.component === 'pipeline') {
        nodeType = 'stage';
      } else {
        nodeType = 'tool';
      }

      // Check if we need to create/update the node
      if (
        entry.operation === 'stage_input' ||
        entry.operation === 'execute' ||
        entry.operation === 'chat'
      ) {
        const node: GraphNode = {
          id: nodeId,
          type: nodeType,
          name:
            entry.component === 'pipeline'
              ? `Stage ${entry.stage}`
              : entry.component,
          icon: this.getNodeIcon(nodeType),
          color: this.getNodeColor(nodeType),
          size: 'medium',
          startTime: new Date(entry.timestamp),
          status: 'running',
          parentId: entry.stage ? `pipeline-${entry.stage}` : undefined,
          childrenIds: [],
          dependsOn: [],
          input: entry.input,
        };

        nodeMap.set(nodeId, node);
        nodes.push(node);
      }

      // Update node on completion
      if (
        entry.operation === 'stage_output' ||
        entry.operation === 'execute' ||
        entry.operation === 'chat'
      ) {
        const node = nodeMap.get(nodeId);
        console.log(
          `Update node: nodeId=${nodeId}, found=${!!node}, operation=${entry.operation}, component=${entry.component}`,
        );
        if (node) {
          node.endTime = new Date(entry.timestamp);
          node.duration = entry.executionTime || 0;
          node.status = 'completed';
          node.output = entry.output;

          console.log(
            `Node ${nodeId}: has metadata=${!!entry.metadata}, has toolLatency=${!!entry.metadata?.toolLatency}`,
          );

          // Extract metrics from LLM calls
          if (entry.metadata?.tokensUsed) {
            node.metrics = {
              tokensUsed: entry.metadata.tokensUsed,
              modelLatency: entry.executionTime || 0,
              retryCount: 0,
            };
          }

          // Extract metrics from tool calls
          if (entry.metadata?.toolLatency) {
            console.log(
              `Setting tool metrics for ${node.id}: toolLatency=${entry.metadata.toolLatency}`,
            );
            node.metrics = {
              ...node.metrics,
              toolLatency: entry.metadata.toolLatency,
              latency: entry.metadata.toolLatency,
            };
            console.log(`Tool metrics set:`, node.metrics);
          }

          // Extract web_fetch extraction metadata (from output)
          if (entry.output?.extractionMetadata) {
            console.log(`Setting extraction metadata for ${node.id}`);
            node.metrics = {
              ...node.metrics,
              extractionMetadata: entry.output.extractionMetadata,
              screenshotPath: entry.output.screenshotPath,
            };
            console.log(`Extraction metadata set for ${node.id}:`, {
              hasReadability: !!entry.output.extractionMetadata.readability,
              hasVision: !!entry.output.extractionMetadata.vision,
              hasCheerio: !!entry.output.extractionMetadata.cheerio,
              selectionReason: entry.output.extractionMetadata.selectionReason,
            });
          }
        } else {
          console.log(
            `WARNING: Node not found in nodeMap for nodeId=${nodeId}`,
          );
        }
      }

      // Handle errors
      if (entry.operation === 'stage_error') {
        const node = nodeMap.get(nodeId);
        if (node) {
          node.status = 'error';
          node.error = entry.metadata?.error || 'Unknown error';
        }
      }
    });

    // Build edges between nodes
    nodes.forEach((node) => {
      if (node.parentId) {
        edges.push({
          id: `${node.parentId}-${node.id}`,
          source: node.parentId,
          target: node.id,
          type: 'parent-child',
        });

        // Update parent's children list
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.childrenIds.push(node.id);
        }
      }
    });

    // Calculate metadata
    const times = nodes.map((n) => n.startTime.getTime());
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

  private getNodeIcon(type: string): string {
    const iconMap = {
      stage: '⚙️',
      tool: '🔧',
      llm: '🤖',
      retry: '🔄',
    };
    return iconMap[type] || '●';
  }

  private getNodeColor(type: string): string {
    const colorMap = {
      stage: '#3b82f6', // blue
      tool: '#10b981', // green
      llm: '#8b5cf6', // purple
      retry: '#f59e0b', // amber
    };
    return colorMap[type] || '#6b7280';
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
