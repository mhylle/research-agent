export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ResearchProgressData {
  logId?: string;
  stage?: string;
  progress?: number;
  phaseName?: string;
  toolName?: string;
  eventType?: string;
}

export interface ChatStreamEvent {
  type:
    | 'token'
    | 'done'
    | 'error'
    | 'start'
    | 'research_start'
    | 'research_complete'
    | 'research_progress'
    | 'heartbeat';
  messageId: string;
  content?: string;
  usage?: TokenUsage;
  error?: string;
  data?: ResearchProgressData;
}
