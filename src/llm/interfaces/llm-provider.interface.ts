import { ChatMessage } from './chat-message.interface';
import { ChatResponse } from './chat-response.interface';
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

/**
 * Options for chat completion requests.
 * Provider-agnostic configuration that works across different LLM providers.
 */
export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  toolChoice?: 'auto' | 'none' | 'required';
}

/**
 * Metadata about an LLM provider's capabilities and configuration.
 */
export interface ProviderMetadata {
  name: string;
  model: string;
  supportedFeatures: string[];
}

/**
 * Provider-agnostic interface for LLM services.
 * Implementations handle provider-specific details internally and expose
 * a consistent API for the rest of the application.
 */
export interface ILLMProvider {
  /**
   * Human-readable name of the provider (e.g., 'ollama', 'azure-mistral')
   */
  readonly name: string;

  /**
   * Whether this provider supports tool/function calling
   */
  readonly supportsToolCalling: boolean;

  /**
   * Send a chat completion request to the LLM.
   *
   * @param messages - The conversation messages
   * @param tools - Optional tool definitions for function calling
   * @param options - Optional request configuration
   * @returns Normalized chat response
   */
  chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ChatResponse>;

  /**
   * Get metadata about this provider's configuration and capabilities.
   */
  getProviderMetadata(): ProviderMetadata;
}
