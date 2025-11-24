export interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

export interface ChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: ToolCall[];
  };
  // Token usage information from Ollama
  prompt_eval_count?: number; // Tokens in the prompt
  eval_count?: number; // Tokens in the response
  total_duration?: number; // Total time in nanoseconds
  load_duration?: number; // Model load time in nanoseconds
  prompt_eval_duration?: number; // Prompt evaluation time in nanoseconds
  eval_duration?: number; // Response generation time in nanoseconds
}
