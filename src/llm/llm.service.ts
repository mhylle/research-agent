import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pLimit, { LimitFunction } from 'p-limit';
import { LLMProviderFactory } from './llm-provider.factory';
import {
  ILLMProvider,
  ChatOptions,
  ProviderMetadata,
} from './interfaces/llm-provider.interface';
import { ChatMessage } from './interfaces/chat-message.interface';
import { ChatResponse } from './interfaces/chat-response.interface';
import { ChatStreamChunk } from './interfaces/chat-stream-chunk.interface';
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
  private concurrencyLimit: LimitFunction;
  private maxConcurrent: number;

  constructor(
    private factory: LLMProviderFactory,
    private configService: ConfigService,
  ) {
    this.provider = factory.getProvider();

    // Default 2 concurrent calls, configurable via env
    this.maxConcurrent =
      this.configService.get<number>('LLM_MAX_CONCURRENT_CALLS') || 2;
    this.concurrencyLimit = pLimit(this.maxConcurrent);

    console.log(
      `[LLMService] Initialized with provider: ${this.provider.name}, max concurrent: ${this.maxConcurrent}`,
    );
  }

  /**
   * Send a chat completion request to the configured LLM provider.
   *
   * @param messages - The conversation messages
   * @param tools - Optional tool definitions for function calling
   * @param model - Optional model override (provider-specific)
   * @param providerName - Optional provider override (e.g., 'azure', 'local')
   * @returns Chat completion response with normalized token usage
   */
  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    model?: string,
    providerName?: string,
  ): Promise<ChatResponse> {
    const options: ChatOptions | undefined = model ? { model } : undefined;
    const selectedProvider = providerName
      ? this.factory.getProviderByName(providerName)
      : this.provider;

    // Log queue status when calls are pending
    const pending = this.concurrencyLimit.pendingCount;
    const active = this.concurrencyLimit.activeCount;

    if (pending > 0) {
      console.log(
        `[LLMService] Queued call (active: ${active}/${this.maxConcurrent}, pending: ${pending})`,
      );
    }

    // Queue call through concurrency limiter
    return this.concurrencyLimit(() =>
      selectedProvider.chat(messages, tools, options),
    );
  }

  /**
   * Stream a chat completion request from the configured LLM provider.
   *
   * Note: Streaming requests bypass the concurrency limiter as they hold
   * connections for extended periods and have different resource profiles.
   *
   * @param messages - The conversation messages
   * @param tools - Optional tool definitions for function calling
   * @param model - Optional model override (provider-specific)
   * @param providerName - Optional provider override (e.g., 'azure', 'local')
   * @returns Async iterable of chat stream chunks
   */
  async *chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    model?: string,
    providerName?: string,
  ): AsyncIterable<ChatStreamChunk> {
    const options: ChatOptions | undefined = model ? { model } : undefined;
    const selectedProvider = providerName
      ? this.factory.getProviderByName(providerName)
      : this.provider;

    // Streams bypass concurrency control as they maintain long-lived connections
    // and have different resource management requirements
    yield* selectedProvider.chatStream(messages, tools, options);
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
