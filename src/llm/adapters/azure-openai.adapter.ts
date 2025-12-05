import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LLMAdapter } from '../interfaces/llm-adapter.interface';
import { ChatMessage } from '../interfaces/chat-message.interface';
import { ChatResponse, ToolCall } from '../interfaces/chat-response.interface';
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

interface AzureOpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

interface AzureOpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class AzureOpenAIAdapter implements LLMAdapter {
  private readonly logger = new Logger(AzureOpenAIAdapter.name);
  private endpoint: string;
  private apiKey: string;
  private model: string;

  constructor(private configService: ConfigService) {
    this.endpoint = this.configService.get<string>('AZURE_OPENAI_ENDPOINT') || '';
    this.apiKey = this.configService.get<string>('AZURE_OPENAI_API_KEY') || '';
    this.model = this.configService.get<string>('AZURE_OPENAI_MODEL') || 'gpt-4';

    if (this.endpoint && this.apiKey) {
      this.logger.log(`Azure OpenAI adapter initialized: model=${this.model}`);
    }
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    model?: string,
  ): Promise<ChatResponse> {
    const azureMessages = this.convertMessages(messages);
    const azureTools = tools ? this.convertTools(tools) : undefined;

    this.logger.debug(`Sending request to Azure OpenAI: ${this.endpoint}`);

    try {
      const response = await axios.post<AzureOpenAIResponse>(
        this.endpoint,
        {
          messages: azureMessages,
          tools: azureTools,
          tool_choice: azureTools ? 'auto' : undefined,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
          },
          timeout: 120000,
        },
      );

      return this.convertResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Azure OpenAI API error: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`,
        );
        throw new Error(
          `Azure OpenAI API error: ${error.response?.status} - ${error.response?.data?.error?.message || error.message}`,
        );
      }
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.endpoint || !this.apiKey) {
      this.logger.debug('Azure OpenAI not configured: missing endpoint or API key');
      return false;
    }

    try {
      await axios.post(
        this.endpoint,
        {
          messages: [{ role: 'user', content: 'test' }],
          max_completion_tokens: 50,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
          },
          timeout: 10000,
        },
      );
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.debug(`Azure OpenAI availability check failed: ${error.response?.status} - ${error.response?.data?.error?.message || error.message}`);
      }
      return false;
    }
  }

  getProviderName(): string {
    return 'azure-openai';
  }

  private convertMessages(messages: ChatMessage[]): AzureOpenAIMessage[] {
    return messages.map((msg: any) => {
      const azureMsg: AzureOpenAIMessage = {
        role: msg.role,
        content: msg.content || '',
      };

      // For assistant messages with tool calls, include the tool_calls array
      if (msg.role === 'assistant' && msg.tool_calls?.length > 0) {
        azureMsg.tool_calls = msg.tool_calls.map((tc: any) => ({
          id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments),
          },
        }));
      }

      // For tool result messages, include the tool_call_id
      if (msg.role === 'tool' && msg.tool_call_id) {
        azureMsg.tool_call_id = msg.tool_call_id;
      }

      return azureMsg;
    });
  }

  private convertTools(
    tools: ToolDefinition[],
  ): Array<{ type: 'function'; function: { name: string; description: string; parameters: any } }> {
    // ToolDefinition is already in the correct format for OpenAI API
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters || { type: 'object', properties: {} },
      },
    }));
  }

  private convertResponse(response: AzureOpenAIResponse): ChatResponse {
    const choice = response.choices[0];
    const message = choice?.message;

    // Preserve the id from tool calls so they can be matched with tool results
    const toolCalls: ToolCall[] | undefined = message?.tool_calls?.map((tc) => ({
      id: tc.id,
      function: {
        name: tc.function.name,
        arguments: this.parseArguments(tc.function.arguments),
      },
    }));

    return {
      message: {
        role: message?.role || 'assistant',
        content: message?.content || '',
        tool_calls: toolCalls,
      },
      prompt_eval_count: response.usage?.prompt_tokens,
      eval_count: response.usage?.completion_tokens,
    };
  }

  private parseArguments(args: string): Record<string, any> {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
}
