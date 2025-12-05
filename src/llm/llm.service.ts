import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMAdapter } from './interfaces/llm-adapter.interface';
import { ChatMessage } from './interfaces/chat-message.interface';
import { ChatResponse } from './interfaces/chat-response.interface';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';
import { OllamaAdapter } from './adapters/ollama.adapter';
import { AzureOpenAIAdapter } from './adapters/azure-openai.adapter';

export type LLMProvider = 'ollama' | 'azure-openai';

@Injectable()
export class LLMService implements OnModuleInit {
  private readonly logger = new Logger(LLMService.name);
  private adapter: LLMAdapter;
  private provider: LLMProvider;

  constructor(
    private configService: ConfigService,
    private ollamaAdapter: OllamaAdapter,
    private azureOpenAIAdapter: AzureOpenAIAdapter,
  ) {
    this.provider = (this.configService.get<string>('LLM_PROVIDER') || 'ollama') as LLMProvider;
    this.adapter = this.selectAdapter(this.provider);
    this.logger.log(`LLM Service initialized with provider: ${this.provider}`);
  }

  async onModuleInit() {
    const isAvailable = await this.adapter.isAvailable();
    if (isAvailable) {
      this.logger.log(`LLM provider ${this.provider} is available`);
    } else {
      this.logger.warn(`LLM provider ${this.provider} is not available`);
    }
  }

  private selectAdapter(provider: LLMProvider): LLMAdapter {
    switch (provider) {
      case 'azure-openai':
        return this.azureOpenAIAdapter;
      case 'ollama':
      default:
        return this.ollamaAdapter;
    }
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    model?: string,
  ): Promise<ChatResponse> {
    return this.adapter.chat(messages, tools, model);
  }

  async isAvailable(): Promise<boolean> {
    return this.adapter.isAvailable();
  }

  getProviderName(): string {
    return this.adapter.getProviderName();
  }

  getProvider(): LLMProvider {
    return this.provider;
  }
}
