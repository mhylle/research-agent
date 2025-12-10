import { ToolCall, TokenUsage } from './chat-response.interface';

/**
 * Represents a single chunk in an LLM streaming response.
 * Used for real-time token-by-token or chunk-by-chunk delivery.
 */
export interface ChatStreamChunk {
  /**
   * Incremental content for this chunk.
   * May be undefined if this chunk only contains tool calls or metadata.
   */
  content?: string;

  /**
   * Tool calls requested by the LLM in this chunk.
   * Typically only present in the final chunk when tools are invoked.
   */
  toolCalls?: ToolCall[];

  /**
   * Indicates whether this is the final chunk in the stream.
   * When true, no more chunks will follow.
   */
  done: boolean;

  /**
   * Token usage statistics, typically only present in the final chunk.
   * Contains cumulative token counts for the entire generation.
   */
  usage?: TokenUsage;
}
