import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  NodeLifecycleEvent,
  MilestoneEvent,
  MilestoneData,
} from './interfaces/enhanced-log-entry.interface';

@Injectable()
export class ResearchLogger {
  private logger: winston.Logger;
  private eventEmitter: EventEmitter;
  private activeNodes = new Map<string, NodeLifecycleEvent>();

  constructor(private configService: ConfigService) {
    const logDir: string =
      this.configService.get<string>('LOG_DIR') || './logs';

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: this.configService.get<string>('LOG_LEVEL') || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(logDir, 'research-error.log'),
          level: 'error',
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'research-combined.log'),
        }),
      ],
    });

    // Add console transport in non-production
    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.add(
        new winston.transports.Console({
          format: winston.format.simple(),
        }),
      );
    }

    // Initialize event emitter for real-time streaming
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100); // Support multiple concurrent sessions
  }

  logStageInput(stage: number, logId: string, input: any) {
    this.logger.info('Stage input', {
      logId,
      stage,
      component: 'pipeline',
      operation: 'stage_input',
      input: this.sanitize(input),
      timestamp: new Date().toISOString(),
    });
  }

  logStageOutput(
    stage: number,
    logId: string,
    output: any,
    executionTime: number,
  ) {
    this.logger.info('Stage output', {
      logId,
      stage,
      component: 'pipeline',
      operation: 'stage_output',
      output: this.sanitize(output),
      executionTime,
      timestamp: new Date().toISOString(),
    });
  }

  logToolExecution(
    logId: string,
    toolName: string,
    args: any,
    result: any,
    executionTime: number,
  ) {
    this.logger.info('Tool executed', {
      logId,
      component: toolName,
      operation: 'execute',
      input: this.sanitize(args),
      output: this.sanitize(result),
      executionTime,
      metadata: {
        toolLatency: executionTime,
        toolName: toolName,
        inputSize: JSON.stringify(args).length,
        outputSize: JSON.stringify(result).length,
      },
      timestamp: new Date().toISOString(),
    });
  }

  logLLMCall(
    logId: string,
    stage: number,
    model: string,
    promptTokens: number,
    completionTokens: number,
    totalTokens: number,
    executionTime: number,
    durationDetails?: {
      loadDuration?: number;
      promptEvalDuration?: number;
      evalDuration?: number;
    },
  ) {
    this.logger.info('LLM call', {
      logId,
      stage,
      component: 'llm',
      operation: 'chat',
      metadata: {
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        tokensUsed: totalTokens,
        ...durationDetails,
      },
      executionTime,
      timestamp: new Date().toISOString(),
    });
  }

  logStageError(stage: number, logId: string, error: any) {
    this.logger.error('Stage error', {
      logId,
      stage,
      component: 'pipeline',
      operation: 'stage_error',
      metadata: { error: error.message },
      timestamp: new Date().toISOString(),
    });
  }

  private sanitize(data: any): any {
    // NO truncation - log everything for complete debugging visibility
    // Disk space is not a concern, complete data is critical
    return data;
  }

  // Node lifecycle methods for real-time graph visualization
  nodeStart(
    nodeId: string,
    logId: string,
    nodeType: 'stage' | 'tool' | 'llm' | 'retry',
    parentId?: string,
  ): void {
    const event: NodeLifecycleEvent = {
      logId,
      nodeId,
      parentNodeId: parentId,
      nodeType,
      event: 'start',
      timestamp: new Date().toISOString(),
      status: 'running',
    };

    this.activeNodes.set(nodeId, event);
    this.emitEvent(event);

    this.logger.info('Node started', {
      logId,
      nodeId,
      nodeType,
      parentNodeId: parentId,
      timestamp: event.timestamp,
    });
  }

  nodeProgress(nodeId: string, logId: string, progress: any): void {
    const event: NodeLifecycleEvent = {
      logId,
      nodeId,
      nodeType: this.activeNodes.get(nodeId)?.nodeType || 'stage',
      event: 'progress',
      timestamp: new Date().toISOString(),
      data: progress,
      status: 'running',
    };

    this.emitEvent(event);
  }

  nodeComplete(nodeId: string, logId: string, result: any): void {
    const startEvent = this.activeNodes.get(nodeId);
    const event: NodeLifecycleEvent = {
      logId,
      nodeId,
      nodeType: startEvent?.nodeType || 'stage',
      event: 'complete',
      timestamp: new Date().toISOString(),
      data: result,
      status: 'completed',
    };

    this.activeNodes.delete(nodeId);
    this.emitEvent(event);

    this.logger.info('Node completed', {
      logId,
      nodeId,
      nodeType: event.nodeType,
      timestamp: event.timestamp,
    });
  }

  nodeError(nodeId: string, logId: string, error: any): void {
    const startEvent = this.activeNodes.get(nodeId);
    const event: NodeLifecycleEvent = {
      logId,
      nodeId,
      nodeType: startEvent?.nodeType || 'stage',
      event: 'error',
      timestamp: new Date().toISOString(),
      data: { error: error.message || error },
      status: 'error',
    };

    this.activeNodes.delete(nodeId);
    this.emitEvent(event);

    this.logger.error('Node error', {
      logId,
      nodeId,
      nodeType: event.nodeType,
      error: error.message || error,
      timestamp: event.timestamp,
    });
  }

  private emitEvent(event: NodeLifecycleEvent): void {
    // Emit to all listeners for this logId
    this.eventEmitter.emit(`event:${event.logId}`, event);
    // Also emit to global listener
    this.eventEmitter.emit('event:*', event);
  }

  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  getActiveNodes(): Map<string, NodeLifecycleEvent> {
    return this.activeNodes;
  }

  logMilestone(
    logId: string,
    nodeId: string,
    milestoneId: string,
    stage: 1 | 2 | 3,
    template: string,
    data: Record<string, any>,
    progress: number,
    status: 'pending' | 'running' | 'completed' | 'error' = 'running',
  ): void {
    const timestamp = new Date().toISOString();

    const milestoneData: MilestoneData = {
      milestoneId,
      stage,
      template,
      data,
      progress,
      status,
      timestamp,
    };

    // 1. Persist to database (log to winston for now - matches existing pattern)
    this.logger.info('Milestone', {
      logId,
      nodeId,
      nodeType: 'stage',
      stage,
      component: 'milestone',
      operation: 'progress',
      input: { template, data },
      output: { progress, status },
      status,
      timestamp,
      startTime: timestamp,
      milestone: milestoneData,
    });

    // 2. Emit SSE event
    const event: MilestoneEvent = {
      logId,
      nodeId,
      parentNodeId: `stage${stage}`,
      nodeType: 'stage',
      event: 'milestone',
      timestamp,
      milestone: milestoneData,
    };

    this.eventEmitter.emit(`event:${logId}`, event);
    this.eventEmitter.emit('event:*', event);
  }
}
