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
}
