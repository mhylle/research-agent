import { Controller, Param, ParseUUIDPipe, Sse, Logger } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatStreamEvent } from './interfaces/chat-stream-event.interface';

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
      const listener = (event: ChatStreamEvent) => {
        this.logger.debug(`Received event for ${messageId}: ${event.type}`);

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
          setTimeout(() => subscriber.complete(), 100);
        }
      };

      // Listen for chat events on this message
      this.logger.log(`Setting up listener for: chat.${messageId}`);
      this.eventEmitter.on(`chat.${messageId}`, listener);

      // Cleanup on unsubscribe
      return () => {
        this.logger.log(`SSE connection closed for message: ${messageId}`);
        this.eventEmitter.off(`chat.${messageId}`, listener);
      };
    });
  }
}
