import { ToolCall } from './chat-response.interface';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /**
   * Required for tool responses when using Azure Mistral.
   * Must match the id of the tool_call being responded to.
   */
  tool_call_id?: string;
  /**
   * Tool calls made by the assistant.
   * Required for multi-turn tool conversations with Azure Mistral.
   */
  tool_calls?: ToolCall[];
}
