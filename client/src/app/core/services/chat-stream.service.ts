import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Connection status types
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Service for managing SSE streaming connections for chat message responses.
 * Handles real-time token streaming, research progress events, and connection management.
 */
@Injectable({
  providedIn: 'root'
})
export class ChatStreamService {
  // State signals
  isStreaming = signal<boolean>(false);
  streamingContent = signal<string>('');
  error = signal<string | null>(null);
  currentMessageId = signal<string | null>(null);
  connectionStatus = signal<ConnectionStatus>('disconnected');

  // Research integration signals
  isResearchActive = signal<boolean>(false);
  researchLogId = signal<string | null>(null);

  // Research progress tracking
  researchProgress = signal<number>(0);
  researchStage = signal<string | null>(null);

  // Token usage tracking
  tokenUsage = signal<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null>(null);

  // SSE connection
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000; // ms, doubles on each retry
  private heartbeatTimeout: any = null;
  private readonly heartbeatInterval = 60000; // 60 seconds (increased for research)

  /**
   * Start streaming response for a message
   * @param messageId The ID of the message to stream the response for
   */
  startStream(messageId: string): void {
    // Close existing connection
    this.disconnect();

    // Reset state
    this.streamingContent.set('');
    this.error.set(null);
    this.isStreaming.set(true);
    this.currentMessageId.set(messageId);
    this.connectionStatus.set('connecting');
    this.reconnectAttempts = 0;
    this.isResearchActive.set(false);
    this.researchLogId.set(null);
    this.tokenUsage.set(null);

    this.connect(messageId);
  }

  private connect(messageId: string): void {
    const url = `${environment.apiUrl}/chat/stream/${messageId}`;
    console.log(`[ChatStream] Connecting to SSE stream: ${url}`);

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log('[ChatStream] SSE connection opened');
      this.connectionStatus.set('connected');
      this.error.set(null);
      this.reconnectAttempts = 0; // Reset reconnect counter on successful connection
      this.startHeartbeat();
    };

    // Handle token streaming events
    this.eventSource.addEventListener('token', (event: MessageEvent) => {
      this.handleTokenEvent(event);
    });

    // Handle completion events
    this.eventSource.addEventListener('done', (event: MessageEvent) => {
      this.handleDoneEvent(event);
    });

    // Handle error events
    this.eventSource.addEventListener('error', (event: MessageEvent) => {
      this.handleErrorEvent(event);
    });

    // Handle research start events
    this.eventSource.addEventListener('research_start', (event: MessageEvent) => {
      this.handleResearchStartEvent(event);
    });

    // Handle research completion events
    this.eventSource.addEventListener('research_complete', (event: MessageEvent) => {
      this.handleResearchCompleteEvent(event);
    });

    // Handle research progress events
    this.eventSource.addEventListener('research_progress', (event: MessageEvent) => {
      this.handleResearchProgressEvent(event);
    });

    // Handle heartbeat events
    this.eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
      this.handleHeartbeatEvent(event);
    });

    // Handle connection errors
    this.eventSource.onerror = (error: Event) => {
      this.handleConnectionError(error);
    };
  }

  private handleTokenEvent(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      console.log('[ChatStream] Token event:', data);

      const content = data.content || '';
      this.streamingContent.update(current => current + content);
      this.resetHeartbeat(); // Reset heartbeat on activity
    } catch (err) {
      console.error('[ChatStream] Error parsing token event:', err);
      this.setErrorMessage('Failed to parse streaming data', 'parse_error');
    }
  }

  private handleDoneEvent(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      console.log('[ChatStream] Done event:', data);

      // Update token usage if provided
      if (data.tokenUsage) {
        this.tokenUsage.set(data.tokenUsage);
      }

      // Mark streaming as complete
      this.isStreaming.set(false);
      this.connectionStatus.set('disconnected');

      // Disconnect after successful completion
      this.disconnect();
    } catch (err) {
      console.error('[ChatStream] Error parsing done event:', err);
      this.setErrorMessage('Failed to complete streaming', 'completion_error');
      this.isStreaming.set(false);
      this.disconnect();
    }
  }

  private handleErrorEvent(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      console.error('[ChatStream] Error event:', data);

      const errorMessage = data.error || data.message || 'An error occurred during streaming';
      this.setErrorMessage(errorMessage, 'server_error');
      this.isStreaming.set(false);
      this.connectionStatus.set('error');
      this.disconnect();
    } catch (err) {
      console.error('[ChatStream] Error parsing error event:', err);
      this.setErrorMessage('Failed to process error response', 'parse_error');
      this.isStreaming.set(false);
      this.connectionStatus.set('error');
      this.disconnect();
    }
  }

  private handleResearchStartEvent(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      console.log('[ChatStream] Research start event:', data);

      this.isResearchActive.set(true);
      this.researchProgress.set(0);
      this.researchStage.set('Starting research...');
      this.resetHeartbeat(); // CRITICAL: Reset heartbeat on research_start

      if (data.data?.logId) {
        this.researchLogId.set(data.data.logId);
      }
    } catch (err) {
      console.error('[ChatStream] Error parsing research_start event:', err);
    }
  }

  private handleResearchCompleteEvent(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      console.log('[ChatStream] Research complete event:', data);

      this.isResearchActive.set(false);
      this.researchProgress.set(100);
      this.researchStage.set('Research complete');
      this.resetHeartbeat(); // Reset heartbeat after research completes
    } catch (err) {
      console.error('[ChatStream] Error parsing research_complete event:', err);
    }
  }

  private handleResearchProgressEvent(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      console.log('[ChatStream] Research progress event:', data);

      this.resetHeartbeat(); // CRITICAL: Reset heartbeat on any progress event

      // Update progress state from the nested data
      const progressData = data.data;
      if (progressData) {
        if (typeof progressData.progress === 'number') {
          this.researchProgress.set(progressData.progress);
        }
        if (progressData.stage || progressData.phaseName || progressData.toolName) {
          const stage = progressData.phaseName || progressData.toolName || progressData.stage || 'Processing...';
          this.researchStage.set(stage);
        }
      }
    } catch (err) {
      console.error('[ChatStream] Error parsing research_progress event:', err);
    }
  }

  private handleHeartbeatEvent(event: MessageEvent): void {
    console.log('[ChatStream] Heartbeat event received');
    this.resetHeartbeat(); // CRITICAL: Reset heartbeat to keep connection alive
  }

  private handleConnectionError(error?: Event): void {
    console.error('[ChatStream] Connection error', error);

    // Determine error type
    let errorType = 'network_error';
    if (this.eventSource?.readyState === EventSource.CLOSED) {
      errorType = 'connection_closed';
    }

    this.connectionStatus.set('error');

    // Implement exponential backoff reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      this.reconnectAttempts++;

      console.log(`[ChatStream] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      this.setErrorMessage(`Connection lost. Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, errorType);

      setTimeout(() => {
        const messageId = this.currentMessageId();
        if (messageId && this.isStreaming()) {
          this.connectionStatus.set('connecting');
          this.connect(messageId);
        }
      }, delay);
    } else {
      console.error('[ChatStream] Max reconnection attempts reached');
      this.setErrorMessage('Connection lost after multiple retry attempts. Please try sending the message again.', 'max_retries_exceeded');
      this.isStreaming.set(false);
      this.disconnect();
    }
  }

  /**
   * Set error message with contextual information
   */
  private setErrorMessage(message: string, errorType: string): void {
    const errorMessages: Record<string, string> = {
      network_error: '🌐 Network connection lost. Attempting to reconnect...',
      connection_closed: '🔌 Server connection closed unexpectedly. Retrying...',
      timeout: '⏱️ Request timed out. The server took too long to respond.',
      server_error: '⚠️ Server error occurred while processing your message.',
      parse_error: '🔧 Failed to process server response. Please try again.',
      max_retries_exceeded: '❌ Unable to reconnect after multiple attempts. Please try sending your message again.',
      completion_error: '⚠️ Message completed with errors. Please verify the response.',
    };

    const userFriendlyMessage = errorMessages[errorType] || message;
    this.error.set(userFriendlyMessage);
  }

  /**
   * Start heartbeat monitoring to detect stale connections
   */
  private startHeartbeat(): void {
    this.resetHeartbeat();
  }

  /**
   * Reset heartbeat timeout
   */
  private resetHeartbeat(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }

    this.heartbeatTimeout = setTimeout(() => {
      console.warn('[ChatStream] Heartbeat timeout - no data received');
      if (this.isStreaming() && this.connectionStatus() === 'connected') {
        this.handleConnectionError();
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Disconnect from the SSE stream
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.eventSource) {
      console.log('[ChatStream] Disconnecting from SSE stream');
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.connectionStatus() !== 'error') {
      this.connectionStatus.set('disconnected');
    }
  }

  /**
   * Clear all streaming state
   */
  clearStream(): void {
    this.disconnect();
    this.streamingContent.set('');
    this.error.set(null);
    this.isStreaming.set(false);
    this.currentMessageId.set(null);
    this.connectionStatus.set('disconnected');
    this.isResearchActive.set(false);
    this.researchLogId.set(null);
    this.researchProgress.set(0);
    this.researchStage.set(null);
    this.tokenUsage.set(null);
  }

  /**
   * Retry streaming for the current message
   */
  retryStream(): void {
    const messageId = this.currentMessageId();
    if (messageId) {
      console.log('[ChatStream] Retrying stream for message:', messageId);
      this.startStream(messageId);
    }
  }
}
