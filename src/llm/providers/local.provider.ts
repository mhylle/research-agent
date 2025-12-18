import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ILLMProvider,
  ChatOptions,
  ProviderMetadata,
} from '../interfaces/llm-provider.interface';
import { ChatMessage } from '../interfaces/chat-message.interface';
import { ChatResponse } from '../interfaces/chat-response.interface';
import { ChatStreamChunk } from '../interfaces/chat-stream-chunk.interface';
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

/**
 * Local LLM provider using OpenAI-compatible API.
 * Connects to a local LLM server (e.g., vLLM, text-generation-inference).
 */
@Injectable()
export class LocalLLMProvider implements ILLMProvider {
  private readonly logger = new Logger(LocalLLMProvider.name);
  private baseUrl: string;
  private model: string;

  readonly name = 'local';
  readonly supportsToolCalling = false;

  constructor(private configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('LOCAL_LLM_URL') ||
      'http://dc2-nvgp011.systematicgroup.local:8087/v1/chat/completions';
    this.model =
      this.configService.get<string>('LOCAL_LLM_MODEL') || 'llama3.3';

    this.logger.log(
      `Initialized with baseUrl=${this.baseUrl}, model=${this.model}`,
    );
  }

  async chat(
    messages: ChatMessage[],
    _tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model || this.model;

    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const requestBody = {
      model,
      messages: formattedMessages,
      stream: false,
      ...(options?.temperature && { temperature: options.temperature }),
      ...(options?.maxTokens && { max_tokens: options.maxTokens }),
    };

    this.logger.debug(`Sending request to ${this.baseUrl}`);

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Local LLM request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          role: string;
          content: string;
        };
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = data.choices[0];

    return {
      message: {
        role: choice.message.role as 'assistant',
        content: choice.message.content,
      },
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      providerMetadata: this.getProviderMetadata(),
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    _tools?: ToolDefinition[],
    options?: ChatOptions,
  ): AsyncIterable<ChatStreamChunk> {
    // Simple non-streaming implementation that yields the full response
    const response = await this.chat(messages, undefined, options);

    yield {
      content: response.message.content,
      done: true,
      usage: response.usage,
    };
  }

  getProviderMetadata(): ProviderMetadata {
    return {
      name: this.name,
      model: this.model,
      supportedFeatures: ['chat'],
    };
  }
}
