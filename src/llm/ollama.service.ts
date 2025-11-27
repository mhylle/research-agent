import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ollama } from 'ollama';
import { ChatMessage } from './interfaces/chat-message.interface';
import { ChatResponse } from './interfaces/chat-response.interface';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';

@Injectable()
export class OllamaService {
  private ollama: Ollama;
  private model: string;

  constructor(private configService: ConfigService) {
    const baseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://localhost:11434';
    this.model = this.configService.get<string>('OLLAMA_MODEL') || 'qwen2.5';

    this.ollama = new Ollama({ host: baseUrl });
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
}
