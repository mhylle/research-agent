/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
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
 * Azure Mistral LLM provider implementation.
 * Uses the OpenAI SDK to communicate with Azure's Mistral endpoint.
 *
 * Key differences from Ollama:
 * - Null values are NOT allowed in request body
 * - System messages must be paired with user messages
 * - Tool call IDs are REQUIRED for tool responses
 * - Arguments come as strings and must be parsed
 *
 * Retry behavior:
 * - Retries on 503, 429, 500, 502, 504 and network errors
 * - Uses exponential backoff with jitter
 * - Configurable via AZURE_LLM_MAX_RETRIES and AZURE_LLM_INITIAL_RETRY_DELAY_MS
 *
 * Note: ESLint warnings for 'any' types are suppressed for error handling
 * and JSON parsing where types cannot be known at compile time.
 */
@Injectable()
export class AzureMistralProvider implements ILLMProvider {
  private client: OpenAI;
  private model: string;
  private maxRetries: number;
  private initialRetryDelayMs: number;

  readonly name = 'azure-mistral';
  readonly supportsToolCalling = true;

  // HTTP status codes that should trigger a retry
  private readonly RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.get<string>('AZURE_OPENAI_ENDPOINT');
    const apiKey = this.configService.get<string>('AZURE_OPENAI_API_KEY');
    this.model =
      this.configService.get<string>('AZURE_MISTRAL_MODEL') ||
      'Mistral-Large-3';

    // Retry configuration
    this.maxRetries =
      this.configService.get<number>('AZURE_LLM_MAX_RETRIES') ?? 3;
    this.initialRetryDelayMs =
      this.configService.get<number>('AZURE_LLM_INITIAL_RETRY_DELAY_MS') ??
      1000;

    if (!endpoint || !apiKey) {
      console.warn(
        '[AzureMistralProvider] Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY. Provider will fail on chat requests.',
      );
    }

    // Initialize OpenAI client with Azure endpoint
    // Note: We disable the SDK's built-in retries to use our own retry logic
    // For Azure AI services, extract base URL and add api-version as default query param
    let baseURL = endpoint;
    let defaultQuery: Record<string, string> | undefined;

    if (endpoint?.includes('api-version=')) {
      // Extract api-version from URL and set as default query param
      const url = new URL(endpoint);
      const apiVersion = url.searchParams.get('api-version');
      url.searchParams.delete('api-version');
      // Remove /chat/completions if present (SDK will add it)
      baseURL = url.toString().replace(/\/chat\/completions\/?$/, '').replace(/\?$/, '');
      if (apiVersion) {
        defaultQuery = { 'api-version': apiVersion };
      }
    }

    this.client = new OpenAI({
      baseURL,
      apiKey: apiKey || '',
      maxRetries: 0, // Disable SDK retries, we handle retries ourselves
      defaultQuery,
    });

    console.log(
      `[AzureMistralProvider] Initialized with maxRetries=${this.maxRetries}, initialRetryDelayMs=${this.initialRetryDelayMs}`,
    );
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model || this.model;

    // Validate and transform messages for Azure Mistral
    const validatedMessages = this.validateMessages(messages);

    // Strict validation: Trace tool call / response balance and THROW on mismatch
    this.debugTraceToolCallBalance(validatedMessages);

    // Build request body, sanitizing null values
    const requestBody = this.buildRequestBody(
      validatedMessages,
      tools,
      options,
      model,
    );

    // Execute with retry logic
    return this.executeWithRetry(async () => {
      const response = await this.client.chat.completions.create({
        ...requestBody,
        stream: false, // Ensure non-streaming response type
      });
      return this.normalizeResponse(response);
    }, validatedMessages);
  }

  async *chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const model = options?.model || this.model;

    // Validate and transform messages for Azure Mistral
    const validatedMessages = this.validateMessages(messages);

    // Strict validation: Trace tool call / response balance and THROW on mismatch
    this.debugTraceToolCallBalance(validatedMessages);

    // Build request body, sanitizing null values
    const requestBody = this.buildRequestBody(
      validatedMessages,
      tools,
      options,
      model,
    );

    // Execute streaming request with retry logic
    const stream = await this.executeWithRetry(async () => {
      return await this.client.chat.completions.create({
        ...requestBody,
        stream: true, // Enable streaming
      });
    }, validatedMessages);

    // Accumulate tool calls across chunks
    const accumulatedToolCalls: Map<
      number,
      OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall
    > = new Map();

    // Process stream chunks
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;
      const content = delta?.content || '';

      // Accumulate tool calls
      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index;
          const existing = accumulatedToolCalls.get(index);

          if (existing) {
            // Merge with existing tool call
            if (toolCall.id) existing.id = toolCall.id;
            if (toolCall.type) existing.type = toolCall.type;
            if (toolCall.function) {
              if (!existing.function) {
                existing.function = { name: '', arguments: '' };
              }
              if (toolCall.function.name) {
                existing.function.name += toolCall.function.name;
              }
              if (toolCall.function.arguments) {
                existing.function.arguments += toolCall.function.arguments;
              }
            }
          } else {
            // Initialize new tool call
            accumulatedToolCalls.set(index, {
              index,
              id: toolCall.id || '',
              type: toolCall.type || 'function',
              function: {
                name: toolCall.function?.name || '',
                arguments: toolCall.function?.arguments || '',
              },
            });
          }
        }
      }

      const isLast = choice.finish_reason !== null;

      // Yield chunk
      const streamChunk: ChatStreamChunk = {
        content,
        done: isLast,
      };

      // Add tool calls in the final chunk
      if (isLast && accumulatedToolCalls.size > 0) {
        streamChunk.toolCalls = Array.from(accumulatedToolCalls.values()).map(
          (tc) => ({
            id: tc.id || `call_${Date.now()}`,
            function: {
              name: tc.function?.name || '',
              arguments: this.parseArguments(tc.function?.arguments || '{}'),
            },
          }),
        );
      }

      // Add usage statistics in the final chunk
      if (isLast && chunk.usage) {
        streamChunk.usage = {
          promptTokens: chunk.usage.prompt_tokens || 0,
          completionTokens: chunk.usage.completion_tokens || 0,
          totalTokens: chunk.usage.total_tokens || 0,
        };
      }

      yield streamChunk;
    }
  }

  /**
   * Execute an async operation with exponential backoff retry.
   * Retries on transient Azure errors (503, 429, 500, etc.).
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    validatedMessages?: OpenAI.Chat.ChatCompletionMessageParam[],
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err as Error;

        // Check if error is retryable
        if (!this.isRetryableError(err)) {
          // Log full message sequence on Azure error for debugging
          if ((err as Error).message?.includes('3230') && validatedMessages) {
            this.logMessageSequence(validatedMessages, '3230 error');
          }
          throw err;
        }

        // Don't retry if we've exhausted attempts
        if (attempt >= this.maxRetries) {
          console.error(
            `[AzureMistralProvider] All ${this.maxRetries + 1} attempts failed. Last error: ${lastError.message}`,
          );
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateRetryDelay(attempt);
        console.warn(
          `[AzureMistralProvider] Attempt ${attempt + 1}/${this.maxRetries + 1} failed with retryable error: ${lastError.message}. Retrying in ${delay}ms...`,
        );

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Determine if an error is retryable based on status code or error type.
   * Note: Suppresses any-type errors for error object inspection since error types are unknown.
   */
  private isRetryableError(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }

    const error = err as any;

    // Check for HTTP status code in various error formats
    const statusCode =
      error.status || error.statusCode || error.response?.status;
    if (statusCode && this.RETRYABLE_STATUS_CODES.includes(statusCode)) {
      return true;
    }

    // Check error message for status codes (Azure errors often embed status in message)
    const message = error.message || '';
    for (const code of this.RETRYABLE_STATUS_CODES) {
      if (message.includes(`${code}`) || message.includes(`"code":${code}`)) {
        return true;
      }
    }

    // Check for specific Azure error types
    if (
      message.includes('engine_network_error') ||
      message.includes('Model is not available') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND') ||
      message.includes('socket hang up')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate retry delay using exponential backoff with jitter.
   * Formula: baseDelay * 2^attempt + random jitter (0-500ms)
   */
  private calculateRetryDelay(attempt: number): number {
    const exponentialDelay = this.initialRetryDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 500; // Add 0-500ms of jitter
    const maxDelay = 30000; // Cap at 30 seconds
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  /**
   * Sleep for a specified number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Log message sequence for debugging Azure errors.
   */
  private logMessageSequence(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    errorContext: string,
  ): void {
    console.error(
      `[AzureMistral] Azure returned ${errorContext} - logging message sequence:`,
    );
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        const assistantMsg = msg;
        const tcCount = assistantMsg.tool_calls?.length || 0;
        const tcIds =
          assistantMsg.tool_calls?.map((tc) => tc.id).join(', ') || 'none';
        console.error(`  [${i}] ASSISTANT: tool_calls=${tcCount} [${tcIds}]`);
      } else if (msg.role === 'tool') {
        const toolMsg = msg;
        console.error(`  [${i}] TOOL: tool_call_id=${toolMsg.tool_call_id}`);
      } else {
        console.error(`  [${i}] ${msg.role.toUpperCase()}`);
      }
    }
  }

  /**
   * Debug method to trace tool call / response balance AND ordering in message history.
   * Azure Mistral requires: assistant message with tool_calls must be IMMEDIATELY followed
   * by exactly N tool responses (where N = number of tool_calls), before any other message type.
   *
   * THROWS an error if ordering issues detected to prevent the Azure API call.
   */
  private debugTraceToolCallBalance(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): void {
    // Verify ordering: each assistant message with tool_calls must be followed by exactly those tool responses
    const orderingErrors: string[] = [];
    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        const assistantMsg = msg;
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          const expectedIds = new Set(
            assistantMsg.tool_calls.map((tc) => tc.id),
          );
          const foundIds = new Set<string>();

          // Check next N messages are tool responses
          let j = i + 1;
          while (j < messages.length && messages[j].role === 'tool') {
            const toolMsg = messages[
              j
            ] as OpenAI.Chat.ChatCompletionToolMessageParam;
            foundIds.add(toolMsg.tool_call_id);
            j++;
          }

          // Check if all expected tool responses were found
          const missing = [...expectedIds].filter((id) => !foundIds.has(id));
          const extra = [...foundIds].filter((id) => !expectedIds.has(id));

          if (missing.length > 0 || extra.length > 0) {
            orderingErrors.push(
              `At index ${i}: Assistant has tool_calls [${[...expectedIds].join(', ')}] ` +
                `but next ${j - i - 1} tool responses have IDs [${[...foundIds].join(', ')}]. ` +
                `Missing: [${missing.join(', ')}], Extra: [${extra.join(', ')}]`,
            );
          }

          i = j; // Skip past the tool responses we just checked
          continue;
        }
      }
      i++;
    }

    if (orderingErrors.length > 0) {
      // Log FULL message sequence for debugging
      console.error(
        `[AzureMistral] CRITICAL: Message ordering errors detected!`,
      );
      console.error(
        `[AzureMistral] Full message sequence (${messages.length} messages):`,
      );
      for (let idx = 0; idx < messages.length; idx++) {
        const msg = messages[idx];
        if (msg.role === 'assistant') {
          const assistantMsg = msg;
          const tcCount = assistantMsg.tool_calls?.length || 0;
          const tcIds =
            assistantMsg.tool_calls?.map((tc) => tc.id).join(', ') || 'none';
          console.error(
            `  [${idx}] ASSISTANT: tool_calls=${tcCount} [${tcIds}]`,
          );
        } else if (msg.role === 'tool') {
          const toolMsg = msg;
          console.error(
            `  [${idx}] TOOL: tool_call_id=${toolMsg.tool_call_id}`,
          );
        } else {
          console.error(`  [${idx}] ${msg.role.toUpperCase()}`);
        }
      }
      console.error(`[AzureMistral] Errors:`);
      for (const err of orderingErrors) {
        console.error(`  - ${err}`);
      }
      // Throw to prevent the Azure API call
      throw new Error(
        `Message ordering validation failed: ${orderingErrors[0]}`,
      );
    }
  }

  getProviderMetadata(): ProviderMetadata {
    return {
      name: this.name,
      model: this.model,
      supportedFeatures: ['chat', 'tool_calling'],
    };
  }

  /**
   * Validate and transform messages for Azure Mistral compatibility.
   * - Ensures system messages are paired with user messages
   * - Converts tool messages to proper format with tool_call_id
   */
  private validateMessages(
    messages: ChatMessage[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    if (messages.length === 0) {
      return [];
    }

    const hasUser = messages.some((m) => m.role === 'user');
    const hasSystemOnly =
      messages[0]?.role === 'system' && messages.length === 1;

    // If only system message exists, add empty user message
    let processedMessages = [...messages];
    if (hasSystemOnly || (!hasUser && messages[0]?.role === 'system')) {
      processedMessages = [
        ...messages,
        { role: 'user' as const, content: 'Please proceed.' },
      ];
    }

    // Convert to OpenAI format, filtering out any invalid/skipped messages
    const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (const msg of processedMessages) {
      if (msg.role === 'tool') {
        // Tool responses require tool_call_id
        result.push({
          role: 'tool' as const,
          tool_call_id: msg.tool_call_id || 'unknown',
          content: msg.content,
        });
        continue;
      }

      if (msg.role === 'system') {
        result.push({
          role: 'system' as const,
          content: msg.content,
        });
        continue;
      }

      if (msg.role === 'assistant') {
        // Azure Mistral requires assistant messages to have either
        // non-empty content OR tool_calls - never both empty
        const hasContent = msg.content && msg.content.trim() !== '';
        const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;

        // Skip empty assistant messages that would cause Azure API errors
        if (!hasContent && !hasToolCalls) {
          console.warn(
            '[AzureMistralProvider] Skipping empty assistant message (no content or tool_calls)',
          );
          continue;
        }

        const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
          role: 'assistant' as const,
          content: hasContent ? msg.content : null,
        };

        // Include tool_calls if present (required for multi-turn tool conversations)
        if (hasToolCalls) {
          assistantMsg.tool_calls = msg.tool_calls!.map((tc) => ({
            id: tc.id || `call_${Date.now()}`,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments),
            },
          }));
        }

        result.push(assistantMsg);
        continue;
      }

      // User message
      result.push({
        role: 'user' as const,
        content: msg.content,
      });
    }

    return result;
  }

  /**
   * Build request body with null value sanitization.
   * Azure Mistral rejects requests containing null values.
   */
  private buildRequestBody(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
    model?: string,
  ): OpenAI.Chat.ChatCompletionCreateParams {
    const requestBody: OpenAI.Chat.ChatCompletionCreateParams = {
      model: model || this.model,
      messages,
    };

    // Add tools if provided (sanitize null values)
    if (tools && tools.length > 0) {
      requestBody.tools = tools.map((tool) =>
        this.sanitizeToolDefinition(tool),
      );
    }

    // Add options (sanitize null values)
    if (options) {
      const sanitizedOptions = this.sanitizeOptions(options);
      Object.assign(requestBody, sanitizedOptions);
    }

    return requestBody;
  }

  /**
   * Sanitize tool definitions by removing null/undefined values.
   */
  private sanitizeToolDefinition(
    tool: ToolDefinition,
  ): OpenAI.Chat.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: this.sanitizeObject(tool.function.parameters),
      },
    };
  }

  /**
   * Sanitize options by removing null/undefined values.
   */
  private sanitizeOptions(
    options: ChatOptions,
  ): Partial<OpenAI.Chat.ChatCompletionCreateParams> {
    const result: Partial<OpenAI.Chat.ChatCompletionCreateParams> = {};

    if (options.temperature !== undefined && options.temperature !== null) {
      result.temperature = options.temperature;
    }

    if (options.maxTokens !== undefined && options.maxTokens !== null) {
      result.max_tokens = options.maxTokens;
    }

    if (options.toolChoice !== undefined && options.toolChoice !== null) {
      result.tool_choice = options.toolChoice;
    }

    return result;
  }

  /**
   * Recursively remove null/undefined values from an object.
   */
  private sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.sanitizeObject(value);
      } else if (Array.isArray(value)) {
        result[key] = value
          .filter((v) => v !== null && v !== undefined)
          .map((v) =>
            typeof v === 'object' && v !== null ? this.sanitizeObject(v) : v,
          );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Normalize OpenAI response to common ChatResponse interface.
   */
  private normalizeResponse(
    response: OpenAI.Chat.ChatCompletion,
  ): ChatResponse {
    const choice = response.choices[0];
    const message = choice.message;

    // Normalize tool calls - parse string arguments
    const toolCalls: ToolCall[] | undefined = message.tool_calls?.map((tc) => ({
      id: tc.id,
      function: {
        name: tc.function.name,
        arguments: this.parseArguments(tc.function.arguments),
      },
    }));

    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;

    return {
      message: {
        role: message.role,
        content: message.content || '',
        tool_calls: toolCalls,
      },
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      providerMetadata: {
        id: response.id,
        model: response.model,
        created: response.created,
        finish_reason: choice.finish_reason,
        system_fingerprint: response.system_fingerprint,
      },
      // Legacy fields for backward compatibility
      prompt_eval_count: promptTokens,
      eval_count: completionTokens,
    };
  }

  /**
   * Parse tool call arguments from string to object.
   * Azure Mistral returns arguments as JSON strings.
   */
  private parseArguments(args: string): Record<string, any> {
    try {
      return JSON.parse(args);
    } catch {
      console.warn(
        '[AzureMistralProvider] Failed to parse tool arguments:',
        args,
      );
      return {};
    }
  }
}
