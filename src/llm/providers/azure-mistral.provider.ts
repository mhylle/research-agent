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
 */
@Injectable()
export class AzureMistralProvider implements ILLMProvider {
  private client: OpenAI;
  private model: string;

  readonly name = 'azure-mistral';
  readonly supportsToolCalling = true;

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.get<string>('AZURE_OPENAI_ENDPOINT');
    const apiKey = this.configService.get<string>('AZURE_OPENAI_API_KEY');
    this.model =
      this.configService.get<string>('AZURE_MISTRAL_MODEL') ||
      'Mistral-Large-3';

    if (!endpoint || !apiKey) {
      console.warn(
        '[AzureMistralProvider] Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY. Provider will fail on chat requests.',
      );
    }

    // Initialize OpenAI client with Azure endpoint
    this.client = new OpenAI({
      baseURL: endpoint,
      apiKey: apiKey || '',
    });
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model || this.model;

    // Validate and transform messages for Azure Mistral
    const validatedMessages = this.validateMessages(messages);

    // DEBUG: Trace tool call / response balance before sending to API
    this.debugTraceToolCallBalance(validatedMessages);

    // Build request body, sanitizing null values
    const requestBody = this.buildRequestBody(
      validatedMessages,
      tools,
      options,
      model,
    );

    const response = await this.client.chat.completions.create({
      ...requestBody,
      stream: false, // Ensure non-streaming response type
    });

    return this.normalizeResponse(response);
  }

  /**
   * Debug method to trace tool call / response balance AND ordering in message history.
   * Azure Mistral requires: assistant message with tool_calls must be IMMEDIATELY followed
   * by exactly N tool responses (where N = number of tool_calls), before any other message type.
   */
  private debugTraceToolCallBalance(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): void {
    // Print full message sequence for debugging
    console.log(`[AzureMistral DEBUG] Full message sequence (${messages.length} messages):`);
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        const assistantMsg = msg as OpenAI.Chat.ChatCompletionAssistantMessageParam;
        const tcCount = assistantMsg.tool_calls?.length || 0;
        const tcIds = assistantMsg.tool_calls?.map((tc) => tc.id).join(', ') || 'none';
        const hasContent = assistantMsg.content && typeof assistantMsg.content === 'string' && assistantMsg.content.trim().length > 0;
        console.log(`  [${i}] ASSISTANT: tool_calls=${tcCount} [${tcIds}], hasContent=${hasContent}`);
      } else if (msg.role === 'tool') {
        const toolMsg = msg as OpenAI.Chat.ChatCompletionToolMessageParam;
        console.log(`  [${i}] TOOL: tool_call_id=${toolMsg.tool_call_id}`);
      } else {
        console.log(`  [${i}] ${msg.role.toUpperCase()}: ${(msg as any).content?.substring(0, 50) || '...'}`);
      }
    }

    // Verify ordering: each assistant message with tool_calls must be followed by exactly those tool responses
    let orderingErrors: string[] = [];
    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        const assistantMsg = msg as OpenAI.Chat.ChatCompletionAssistantMessageParam;
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          const expectedIds = new Set(assistantMsg.tool_calls.map((tc) => tc.id));
          const foundIds = new Set<string>();

          // Check next N messages are tool responses
          let j = i + 1;
          while (j < messages.length && messages[j].role === 'tool') {
            const toolMsg = messages[j] as OpenAI.Chat.ChatCompletionToolMessageParam;
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
              `Missing: [${missing.join(', ')}], Extra: [${extra.join(', ')}]`
            );
          }

          i = j; // Skip past the tool responses we just checked
          continue;
        }
      }
      i++;
    }

    if (orderingErrors.length > 0) {
      console.error(`[AzureMistral DEBUG] ORDERING ERRORS DETECTED:`);
      for (const err of orderingErrors) {
        console.error(`  - ${err}`);
      }
    } else {
      console.log(`[AzureMistral DEBUG] Message ordering OK`);
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
