export interface ToolCall {
  /**
   * Unique identifier for this tool call.
   * Required for Azure Mistral to track tool responses.
   */
  id: string;
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

/**
 * Normalized token usage across all providers.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: ToolCall[];
  };
  /**
   * Normalized token usage (provider-agnostic).
   */
  usage: TokenUsage;
  /**
   * Provider-specific metadata (optional).
   * Contains raw provider response data for debugging/logging.
   */
  providerMetadata?: Record<string, any>;
  // Legacy Ollama-specific fields (deprecated, use 'usage' instead)
  /** @deprecated Use usage.promptTokens instead */
  prompt_eval_count?: number;
  /** @deprecated Use usage.completionTokens instead */
  eval_count?: number;
  /** @deprecated Use providerMetadata instead */
  total_duration?: number;
  /** @deprecated Use providerMetadata instead */
  load_duration?: number;
  /** @deprecated Use providerMetadata instead */
  prompt_eval_duration?: number;
  /** @deprecated Use providerMetadata instead */
  eval_duration?: number;
}
