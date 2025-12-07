import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ollama, ChatResponse as OllamaChatResponse } from 'ollama';
import { ChatMessage } from './interfaces/chat-message.interface';
import { ChatResponse } from './interfaces/chat-response.interface';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
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
    const modelToUse = model || this.model;
    this.logger.debug(`Starting streaming chat with model: ${modelToUse}`);

    try {
      // Use streaming to detect hangs - if no chunks arrive, we know it's stuck
      const stream = await this.ollama.chat({
        model: modelToUse,
        messages: messages as any,
        tools: tools as any,
        stream: true,
      });

      // Collect the streamed response
      let content = '';
      let toolCalls: any[] | undefined;
      let finalResponse: OllamaChatResponse | undefined;
      let chunkCount = 0;

      for await (const chunk of stream) {
        chunkCount++;

        // Accumulate content from chunks
        if (chunk.message?.content) {
          content += chunk.message.content;
        }

        // Capture tool calls if present (usually in final chunk)
        if (chunk.message?.tool_calls) {
          toolCalls = chunk.message.tool_calls;
        }

        // The final chunk has done: true and contains the full response metadata
        if (chunk.done) {
          finalResponse = chunk;
        }
      }

      this.logger.debug(
        `Streaming completed: ${chunkCount} chunks received, ${content.length} chars`,
      );

      if (!finalResponse) {
        throw new Error('Stream ended without final response');
      }

      // Normalize response to include required usage field
      const promptTokens = finalResponse.prompt_eval_count || 0;
      const completionTokens = finalResponse.eval_count || 0;

      return {
        ...finalResponse,
        message: {
          role: 'assistant',
          content: content || '',
          tool_calls: toolCalls?.map((tc: any) => ({
            id:
              tc.id ||
              `ollama-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            function: tc.function,
          })),
        },
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      } as ChatResponse;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Chat streaming failed: ${errorMessage}`);
      throw new Error(`Ollama chat failed: ${errorMessage}`);
    }
  }
}
