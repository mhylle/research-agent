import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AzureMistralProvider } from './azure-mistral.provider';

// Store mock create function for access in tests
let mockCreate: jest.Mock;

// Mock OpenAI module - must be before imports are resolved
jest.mock('openai', () => {
  // Create a mock class that can be instantiated with 'new'
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: (...args: any[]) => mockCreate(...args),
      },
    },
  }));
  return { __esModule: true, default: MockOpenAI };
});

describe('AzureMistralProvider', () => {
  let provider: AzureMistralProvider;

  beforeEach(async () => {
    // Reset mock for each test
    mockCreate = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AzureMistralProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                AZURE_OPENAI_ENDPOINT: 'https://test.azure.com/openai/v1/',
                AZURE_OPENAI_API_KEY: 'test-api-key',
                AZURE_MISTRAL_MODEL: 'Mistral-Large-3',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<AzureMistralProvider>(AzureMistralProvider);
  });

  describe('provider properties', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('azure-mistral');
    });

    it('should support tool calling', () => {
      expect(provider.supportsToolCalling).toBe(true);
    });
  });

  describe('getProviderMetadata', () => {
    it('should return provider metadata', () => {
      const metadata = provider.getProviderMetadata();

      expect(metadata.name).toBe('azure-mistral');
      expect(metadata.model).toBe('Mistral-Large-3');
      expect(metadata.supportedFeatures).toContain('chat');
      expect(metadata.supportedFeatures).toContain('tool_calling');
    });
  });

  describe('chat', () => {
    it('should normalize response with token usage', async () => {
      mockCreate.mockResolvedValue({
        id: 'response-123',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello from Azure!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        model: 'Mistral-Large-3',
        created: 1234567890,
      });

      const result = await provider.chat([{ role: 'user', content: 'Hello' }]);

      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBe('Hello from Azure!');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(20);
      expect(result.usage.totalTokens).toBe(30);
    });

    it('should normalize tool calls with IDs', async () => {
      mockCreate.mockResolvedValue({
        id: 'response-456',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-abc123',
                  type: 'function',
                  function: {
                    name: 'tavily_search',
                    arguments: '{"query": "test query"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 15, completion_tokens: 5 },
      });

      const result = await provider.chat([
        { role: 'user', content: 'Search for test' },
      ]);

      expect(result.message.tool_calls).toHaveLength(1);
      expect(result.message.tool_calls![0].id).toBe('call-abc123');
      expect(result.message.tool_calls![0].function.name).toBe('tavily_search');
      expect(result.message.tool_calls![0].function.arguments).toEqual({
        query: 'test query',
      });
    });

    it('should parse string arguments from tool calls', async () => {
      mockCreate.mockResolvedValue({
        id: 'response-789',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-xyz',
                  type: 'function',
                  function: {
                    name: 'web_fetch',
                    arguments:
                      '{"url": "https://example.com", "includeImages": true}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await provider.chat([{ role: 'user', content: 'Fetch' }]);

      expect(result.message.tool_calls![0].function.arguments).toEqual({
        url: 'https://example.com',
        includeImages: true,
      });
    });

    it('should handle malformed JSON arguments gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockCreate.mockResolvedValue({
        id: 'response-bad',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-bad',
                  type: 'function',
                  function: {
                    name: 'test_tool',
                    arguments: 'not valid json',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result.message.tool_calls![0].function.arguments).toEqual({});
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should include provider metadata in response', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-metadata',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
        model: 'Mistral-Large-3',
        created: 1234567890,
        system_fingerprint: 'fp_abc123',
      });

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result.providerMetadata).toBeDefined();
      expect(result.providerMetadata!.id).toBe('resp-metadata');
      expect(result.providerMetadata!.model).toBe('Mistral-Large-3');
      expect(result.providerMetadata!.finish_reason).toBe('stop');
    });

    it('should include legacy fields for backward compatibility', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-legacy',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 15, completion_tokens: 25 },
      });

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result.prompt_eval_count).toBe(15);
      expect(result.eval_count).toBe(25);
    });
  });

  describe('message validation', () => {
    it('should add user message when only system message exists', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-sys',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      await provider.chat([{ role: 'system', content: 'You are helpful.' }]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Please proceed.' },
          ]),
        }),
      );
    });

    it('should not modify messages when user message exists', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-normal',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      await provider.chat([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
          ],
        }),
      );
    });

    it('should convert tool messages with tool_call_id', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-tool',
        choices: [
          {
            message: { role: 'assistant', content: 'Final response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      await provider.chat([
        { role: 'user', content: 'Search' },
        { role: 'assistant', content: '' },
        { role: 'tool', tool_call_id: 'call-123', content: '{"results": []}' },
      ]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'tool',
              tool_call_id: 'call-123',
              content: '{"results": []}',
            }),
          ]),
        }),
      );
    });

    it('should use "unknown" for missing tool_call_id', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-unknown',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      await provider.chat([
        { role: 'user', content: 'Test' },
        { role: 'tool', content: '{"data": "test"}' },
      ]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'tool',
              tool_call_id: 'unknown',
            }),
          ]),
        }),
      );
    });
  });

  describe('null value sanitization', () => {
    it('should exclude undefined options', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-opts',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      await provider.chat([{ role: 'user', content: 'Test' }], undefined, {
        temperature: undefined,
        maxTokens: 100,
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.max_tokens).toBe(100);
      expect(call.temperature).toBeUndefined();
    });

    it('should exclude null options', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-null',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      await provider.chat([{ role: 'user', content: 'Test' }], undefined, {
        temperature: null as any,
        maxTokens: 200,
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.max_tokens).toBe(200);
      expect(call).not.toHaveProperty('temperature');
    });

    it('should pass tool_choice option', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-choice',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      await provider.chat([{ role: 'user', content: 'Test' }], undefined, {
        toolChoice: 'auto',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_choice: 'auto',
        }),
      );
    });

    it('should sanitize tool definitions', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-tools',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'test_tool',
            description: 'Test',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                optional: null, // Should be removed
              },
            },
          },
        },
      ];

      await provider.chat([{ role: 'user', content: 'Test' }], tools);

      const call = mockCreate.mock.calls[0][0];
      expect(
        call.tools[0].function.parameters.properties.optional,
      ).toBeUndefined();
    });
  });

  describe('request configuration', () => {
    it('should always set stream to false', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-stream',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: false,
        }),
      );
    });

    it('should use custom model from options', async () => {
      mockCreate.mockResolvedValue({
        id: 'resp-model',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });

      await provider.chat([{ role: 'user', content: 'Test' }], undefined, {
        model: 'Custom-Model',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'Custom-Model',
        }),
      );
    });
  });
});
