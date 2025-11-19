import { ChatMessage } from '../../llm/interfaces/chat-message.interface';
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

export interface StageContext {
  stageNumber: 1 | 2 | 3;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  systemPrompt: string;
  logId: string;
}
