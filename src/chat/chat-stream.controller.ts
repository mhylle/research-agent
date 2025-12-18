import { Controller, Param, ParseUUIDPipe, Sse, Logger } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ChatStreamEvent,
  ResearchProgressData,
} from './interfaces/chat-stream-event.interface';
import { LogEntry } from '../logging/interfaces/log-entry.interface';

@Controller('api/chat')
export class ChatStreamController {
  private readonly logger = new Logger(ChatStreamController.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  @Sse('stream/:messageId')
  streamChat(
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Observable<MessageEvent> {
    this.logger.log(`SSE connection opened for message: ${messageId}`);

    return new Observable((subscriber: Subscriber<MessageEvent>) => {
      // Track research state for this connection
      let currentLogId: string | null = null;
      let logListener: ((entry: LogEntry) => void) | null = null;
      let heartbeatInterval: NodeJS.Timeout | null = null;
      let isResearching = false;

      // Start heartbeat during research phase
      const startHeartbeat = () => {
        if (heartbeatInterval) return;
        this.logger.debug(`Starting heartbeat for message: ${messageId}`);
        heartbeatInterval = setInterval(() => {
          if (isResearching) {
            const heartbeatEvent: ChatStreamEvent = {
              type: 'heartbeat',
              messageId: messageId,
            };
            subscriber.next({
              data: JSON.stringify(heartbeatEvent),
              type: 'heartbeat',
              id: messageId,
            } as any as MessageEvent);
          }
        }, 10000); // 10 second heartbeat
      };

      // Stop heartbeat
      const stopHeartbeat = () => {
        if (heartbeatInterval) {
          this.logger.debug(`Stopping heartbeat for message: ${messageId}`);
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      };

      // Setup log listener for research progress
      const setupLogListener = (logId: string) => {
        if (logListener && currentLogId) {
          // Clean up previous listener
          this.eventEmitter.off(`log.${currentLogId}`, logListener);
        }

        currentLogId = logId;
        this.logger.debug(`Setting up log listener for: log.${logId}`);

        logListener = (entry: LogEntry) => {
          // Transform log entry to research progress event
          const progressData = this.transformToProgressData(entry);
          const progressEvent: ChatStreamEvent = {
            type: 'research_progress',
            messageId: messageId,
            data: progressData,
          };

          subscriber.next({
            data: JSON.stringify(progressEvent),
            type: 'research_progress',
            id: entry.id || messageId,
          } as any as MessageEvent);
        };

        this.eventEmitter.on(`log.${logId}`, logListener);
      };

      // Cleanup log listener
      const cleanupLogListener = () => {
        if (logListener && currentLogId) {
          this.logger.log(`Removing log listener for: log.${currentLogId}`);
          this.eventEmitter.off(`log.${currentLogId}`, logListener);
          logListener = null;
          currentLogId = null;
        }
      };

      // Main chat event listener
      const chatListener = (event: ChatStreamEvent) => {
        this.logger.debug(
          `Received chat event for ${messageId}: ${event.type}`,
        );

        // Handle research lifecycle events
        if (event.type === 'research_start') {
          isResearching = true;
          startHeartbeat();

          // Setup log listener if logId is provided
          if (event.data?.logId) {
            setupLogListener(event.data.logId);
          } else {
            this.logger.warn(
              `research_start missing logId for message: ${messageId}`,
            );
          }
        }

        if (event.type === 'research_complete') {
          isResearching = false;
          stopHeartbeat();
          cleanupLogListener();
        }

        // Forward the event to the client
        const messageEvent = {
          data: JSON.stringify(event),
          type: event.type,
          id: event.messageId,
        } as any as MessageEvent;

        subscriber.next(messageEvent);

        // Complete stream on done or error events
        if (event.type === 'done' || event.type === 'error') {
          this.logger.log(
            `Completing SSE stream for message: ${messageId} (${event.type})`,
          );
          stopHeartbeat();
          cleanupLogListener();
          setTimeout(() => subscriber.complete(), 100);
        }
      };

      // Listen for chat events on this message
      this.logger.log(`Setting up listener for: chat.${messageId}`);
      this.eventEmitter.on(`chat.${messageId}`, chatListener);

      // Cleanup on unsubscribe
      return () => {
        this.logger.log(`SSE connection closed for message: ${messageId}`);
        stopHeartbeat();
        cleanupLogListener();
        this.eventEmitter.off(`chat.${messageId}`, chatListener);
      };
    });
  }

  /**
   * Transform a log entry to research progress data
   * Maps research pipeline events to a simplified progress structure
   */
  private transformToProgressData(entry: LogEntry): ResearchProgressData {
    const data = entry.data as Record<string, any>;

    // Determine stage based on event type
    let stage = 'processing';
    if (
      entry.eventType?.includes('planning') ||
      entry.eventType === 'plan_created'
    ) {
      stage = 'planning';
    } else if (
      entry.eventType?.includes('retrieval') ||
      entry.eventType?.includes('step') ||
      entry.eventType?.includes('phase')
    ) {
      stage = 'retrieval';
    } else if (
      entry.eventType?.includes('synthesis') ||
      entry.eventType?.includes('session_completed')
    ) {
      stage = 'synthesis';
    }

    // Calculate approximate progress
    let progress = 0;
    switch (entry.eventType) {
      case 'session_started':
        progress = 5;
        break;
      case 'planning_started':
        progress = 10;
        break;
      case 'plan_created':
        progress = 20;
        break;
      case 'phase_started':
        progress = 30;
        break;
      case 'step_started':
        progress = 40;
        break;
      case 'step_completed':
        progress = 60;
        break;
      case 'phase_completed':
        progress = 80;
        break;
      case 'session_completed':
        progress = 100;
        break;
      default:
        progress = 50;
    }

    return {
      logId: entry.logId,
      stage,
      progress,
      phaseName: (data?.phaseName as string) || (data?.name as string),
      toolName: data?.toolName as string | undefined,
      eventType: entry.eventType,
    };
  }
}
