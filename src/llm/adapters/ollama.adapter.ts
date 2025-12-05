import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ollama } from 'ollama';
import { LLMAdapter } from '../interfaces/llm-adapter.interface';
import { ChatMessage } from '../interfaces/chat-message.interface';
import { ChatResponse } from '../interfaces/chat-response.interface';
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

@Injectable()
export class OllamaAdapter implements LLMAdapter {
  private readonly logger = new Logger(OllamaAdapter.name);
  private ollama: Ollama;
  private model: string;
  private baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://localhost:11434';
    this.model = this.configService.get<string>('OLLAMA_MODEL') || 'qwen2.5';

    this.ollama = new Ollama({ host: this.baseUrl });
    this.logger.log(`Ollama adapter initialized: ${this.baseUrl}, model: ${this.model}`);
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    model?: string,
  ): Promise<ChatResponse> {
    const response = await this.ollama.chat({
      model: model || this.model,
      messages: messages as any,
      tools: tools as any,
    });

    return response as ChatResponse;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ollama.list();
      return true;
    } catch {
      return false;
    }
  }

  getProviderName(): string {
    return 'ollama';
  }
}
