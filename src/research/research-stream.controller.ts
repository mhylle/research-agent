import { Controller, Sse, Param, MessageEvent } from '@nestjs/common';
import { Observable, fromEvent, map } from 'rxjs';
import { ResearchLogger } from '../logging/research-logger.service';
import { NodeLifecycleEvent } from '../logging/interfaces/enhanced-log-entry.interface';

@Controller('api/research/stream')
export class ResearchStreamController {
  constructor(private readonly researchLogger: ResearchLogger) {}

  @Sse('events/:logId')
  streamEvents(@Param('logId') logId: string): Observable<MessageEvent> {
    const eventEmitter = this.researchLogger.getEventEmitter();

    return fromEvent<NodeLifecycleEvent>(
      eventEmitter,
      `event:${logId}`
    ).pipe(
      map((event: NodeLifecycleEvent) => ({
        data: event,
        type: `node-${event.event}`,
      }))
    );
  }

  @Sse('events')
  streamAllEvents(): Observable<MessageEvent> {
    const eventEmitter = this.researchLogger.getEventEmitter();

    return fromEvent<NodeLifecycleEvent>(
      eventEmitter,
      'event:*'
    ).pipe(
      map((event: NodeLifecycleEvent) => ({
        data: event,
        type: `node-${event.event}`,
      }))
    );
  }
}
