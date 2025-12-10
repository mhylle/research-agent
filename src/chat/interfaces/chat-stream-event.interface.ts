export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatStreamEvent {
  type:
    | 'token'
    | 'done'
    | 'error'
    | 'start'
    | 'research_start'
    | 'research_complete';
  messageId: string;
  content?: string;
  usage?: TokenUsage;
  error?: string;
}
