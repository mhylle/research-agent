import { ChatMessage } from '../../llm/interfaces/chat-message.interface';
import { ToolCall } from '../../llm/interfaces/chat-response.interface';

export interface StageResult {
  message: ChatMessage;
  tool_calls: ToolCall[];
  executionTime: number;
}
