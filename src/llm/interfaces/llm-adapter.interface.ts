import { ChatMessage } from './chat-message.interface';
import { ChatResponse } from './chat-response.interface';
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

export interface LLMAdapter {
  chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    model?: string,
  ): Promise<ChatResponse>;

  isAvailable(): Promise<boolean>;

  getProviderName(): string;
}
