/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ollama } from 'ollama';
import { randomUUID } from 'crypto';
import {
  ILLMProvider,
  ChatOptions,
  ProviderMetadata,
} from '../interfaces/llm-provider.interface';
import { ChatMessage } from '../interfaces/chat-message.interface';
import { ChatResponse, ToolCall } from '../interfaces/chat-response.interface';
import { ChatStreamChunk } from '../interfaces/chat-stream-chunk.interface';
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

/**
 * Ollama LLM provider implementation.
 * Wraps the Ollama SDK and normalizes responses to the common interface.
 *
 * Note: The Ollama SDK lacks proper TypeScript types for response objects,
 * necessitating the use of 'any' types. ESLint warnings are suppressed for this file.
 */
@Injectable()
export class OllamaProvider implements ILLMProvider {
  private ollama: Ollama;
  private model: string;

  readonly name = 'ollama';
  readonly supportsToolCalling = true;

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
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model || this.model;

    const response = await this.ollama.chat({
      model,
      messages: messages as any,
      tools: tools as any,
      options: this.buildOllamaOptions(options),
    });

    return this.normalizeResponse(response);
  }

  async *chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const model = options?.model || this.model;

    try {
      // Call Ollama with stream: true
      const stream = await this.ollama.chat({
        model,
        messages: messages as any,
        tools: tools as any,
        options: this.buildOllamaOptions(options),
        stream: true,
      });

      // Iterate over the stream and yield normalized chunks
      for await (const chunk of stream) {
        // Extract tool calls if present (typically in final chunk)
        const toolCalls: ToolCall[] | undefined =
          chunk.message?.tool_calls?.map((tc: any) => ({
            id: tc.id || randomUUID(),
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === 'string'
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments,
            },
          }));

        // Yield normalized chunk
        yield {
          content: chunk.message?.content || '',
          toolCalls,
          done: chunk.done || false,
          usage: chunk.done
            ? {
                promptTokens: chunk.prompt_eval_count || 0,
                completionTokens: chunk.eval_count || 0,
                totalTokens:
                  (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
              }
            : undefined,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Ollama chat streaming failed: ${errorMessage}`);
    }
  }

  getProviderMetadata(): ProviderMetadata {
    return {
      name: this.name,
      model: this.model,
      supportedFeatures: ['chat', 'tool_calling', 'streaming'],
    };
  }

  /**
   * Build Ollama-specific options from generic ChatOptions.
   */
  private buildOllamaOptions(
    options?: ChatOptions,
  ): Record<string, any> | undefined {
    if (!options) return undefined;

    const ollamaOptions: Record<string, any> = {};

    if (options.temperature !== undefined) {
      ollamaOptions.temperature = options.temperature;
    }

    if (options.maxTokens !== undefined) {
      ollamaOptions.num_predict = options.maxTokens;
    }

    return Object.keys(ollamaOptions).length > 0 ? ollamaOptions : undefined;
  }

  /**
   * Normalize Ollama response to the common ChatResponse interface.
   */
  private normalizeResponse(ollamaResponse: any): ChatResponse {
    const promptTokens = ollamaResponse.prompt_eval_count || 0;
    const completionTokens = ollamaResponse.eval_count || 0;

    // Normalize tool calls - add unique IDs if not present
    const toolCalls: ToolCall[] | undefined =
      ollamaResponse.message.tool_calls?.map((tc: any) => ({
        id: tc.id || randomUUID(),
        function: {
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments,
        },
      }));

    return {
      message: {
        role: ollamaResponse.message.role,
        content: ollamaResponse.message.content || '',
        tool_calls: toolCalls,
      },
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      providerMetadata: {
        total_duration: ollamaResponse.total_duration,
        load_duration: ollamaResponse.load_duration,
        prompt_eval_duration: ollamaResponse.prompt_eval_duration,
        eval_duration: ollamaResponse.eval_duration,
        model: ollamaResponse.model,
      },
      // Legacy fields for backward compatibility
      prompt_eval_count: promptTokens,
      eval_count: completionTokens,
      total_duration: ollamaResponse.total_duration,
      load_duration: ollamaResponse.load_duration,
      prompt_eval_duration: ollamaResponse.prompt_eval_duration,
      eval_duration: ollamaResponse.eval_duration,
    };
  }
}
