import { Injectable } from '@nestjs/common';
import { LLMProviderFactory } from './llm-provider.factory';
import {
  ILLMProvider,
  ChatOptions,
  ProviderMetadata,
} from './interfaces/llm-provider.interface';
import { ChatMessage } from './interfaces/chat-message.interface';
import { ChatResponse } from './interfaces/chat-response.interface';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';

/**
 * Provider-agnostic LLM service facade.
 * Delegates to the configured provider via the factory.
 *
 * This service provides backward compatibility with the existing OllamaService API
 * while enabling runtime provider switching.
 */
@Injectable()
export class LLMService {
  private provider: ILLMProvider;

  constructor(private factory: LLMProviderFactory) {
    this.provider = factory.getProvider();
    console.log(
      `[LLMService] Initialized with provider: ${this.provider.name}`,
    );
  }

  /**
   * Send a chat completion request to the configured LLM provider.
   *
   * @param messages - The conversation messages
   * @param tools - Optional tool definitions for function calling
   * @param model - Optional model override (provider-specific)
   * @returns Chat completion response with normalized token usage
   */
  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    model?: string,
  ): Promise<ChatResponse> {
    const options: ChatOptions | undefined = model ? { model } : undefined;
    return this.provider.chat(messages, tools, options);
  }

  /**
   * Get metadata about the current provider configuration.
   */
  getProviderInfo(): ProviderMetadata {
    return this.provider.getProviderMetadata();
  }

  /**
   * Get the name of the current provider.
   */
  getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Check if the current provider supports tool calling.
   */
  supportsToolCalling(): boolean {
    return this.provider.supportsToolCalling;
  }
}
