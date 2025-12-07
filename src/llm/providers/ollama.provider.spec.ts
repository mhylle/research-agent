import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OllamaProvider } from './ollama.provider';

// Helper to create async iterable from array
async function* createAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

// Mock the ollama module
jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
  })),
}));

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  let mockOllamaChat: jest.Mock;

  beforeEach(async () => {
    // Get reference to the mocked chat function
    const { Ollama } = require('ollama');
    mockOllamaChat = jest.fn();
    Ollama.mockImplementation(() => ({
      chat: mockOllamaChat,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OllamaProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                OLLAMA_BASE_URL: 'http://localhost:11434',
                OLLAMA_MODEL: 'qwen2.5',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<OllamaProvider>(OllamaProvider);
  });

  describe('provider properties', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('ollama');
    });

    it('should support tool calling', () => {
      expect(provider.supportsToolCalling).toBe(true);
    });
  });

  describe('getProviderMetadata', () => {
    it('should return provider metadata', () => {
      const metadata = provider.getProviderMetadata();

      expect(metadata.name).toBe('ollama');
      expect(metadata.model).toBe('qwen2.5');
      expect(metadata.supportedFeatures).toContain('chat');
      expect(metadata.supportedFeatures).toContain('tool_calling');
    });
  });

  describe('chat', () => {
    it('should normalize response with token usage', async () => {
      mockOllamaChat.mockResolvedValue({
        message: {
          role: 'assistant',
          content: 'Hello, world!',
        },
        prompt_eval_count: 10,
        eval_count: 20,
        total_duration: 1000000,
        load_duration: 100000,
        prompt_eval_duration: 200000,
        eval_duration: 300000,
        model: 'qwen2.5',
      });

      const result = await provider.chat([{ role: 'user', content: 'Hello' }]);

      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBe('Hello, world!');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(20);
      expect(result.usage.totalTokens).toBe(30);
    });

    it('should normalize tool calls with unique IDs', async () => {
      mockOllamaChat.mockResolvedValue({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: 'tavily_search',
                arguments: { query: 'test' },
              },
            },
          ],
        },
        prompt_eval_count: 15,
        eval_count: 5,
      });

      const result = await provider.chat([
        { role: 'user', content: 'Search for test' },
      ]);

      expect(result.message.tool_calls).toHaveLength(1);
      expect(result.message.tool_calls![0].id).toBeDefined();
      expect(result.message.tool_calls![0].function.name).toBe('tavily_search');
      expect(result.message.tool_calls![0].function.arguments).toEqual({
        query: 'test',
      });
    });

    it('should preserve existing tool call IDs', async () => {
      const existingId = 'existing-id-123';
      mockOllamaChat.mockResolvedValue({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: existingId,
              function: {
                name: 'web_fetch',
                arguments: { url: 'https://example.com' },
              },
            },
          ],
        },
        prompt_eval_count: 10,
        eval_count: 5,
      });

      const result = await provider.chat([
        { role: 'user', content: 'Fetch example.com' },
      ]);

      expect(result.message.tool_calls![0].id).toBe(existingId);
    });

    it('should parse string arguments in tool calls', async () => {
      mockOllamaChat.mockResolvedValue({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: 'tavily_search',
                arguments: '{"query": "parsed string"}',
              },
            },
          ],
        },
        prompt_eval_count: 10,
        eval_count: 5,
      });

      const result = await provider.chat([{ role: 'user', content: 'Search' }]);

      expect(result.message.tool_calls![0].function.arguments).toEqual({
        query: 'parsed string',
      });
    });

    it('should handle empty content gracefully', async () => {
      mockOllamaChat.mockResolvedValue({
        message: {
          role: 'assistant',
          content: null,
        },
        prompt_eval_count: 5,
        eval_count: 0,
      });

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result.message.content).toBe('');
    });

    it('should include provider metadata in response', async () => {
      mockOllamaChat.mockResolvedValue({
        message: {
          role: 'assistant',
          content: 'Response',
        },
        prompt_eval_count: 10,
        eval_count: 20,
        total_duration: 5000000,
        load_duration: 1000000,
        model: 'qwen2.5',
      });

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      expect(result.providerMetadata).toBeDefined();
      expect(result.providerMetadata!.model).toBe('qwen2.5');
      expect(result.providerMetadata!.total_duration).toBe(5000000);
    });

    it('should pass temperature option to Ollama', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Response' },
        prompt_eval_count: 10,
        eval_count: 20,
      });

      await provider.chat([{ role: 'user', content: 'Test' }], undefined, {
        temperature: 0.7,
      });

      expect(mockOllamaChat).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ temperature: 0.7 }),
        }),
      );
    });

    it('should pass maxTokens as num_predict to Ollama', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Response' },
        prompt_eval_count: 10,
        eval_count: 20,
      });

      await provider.chat([{ role: 'user', content: 'Test' }], undefined, {
        maxTokens: 500,
      });

      expect(mockOllamaChat).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ num_predict: 500 }),
        }),
      );
    });

    it('should use custom model from options', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Response' },
        prompt_eval_count: 10,
        eval_count: 20,
      });

      await provider.chat([{ role: 'user', content: 'Test' }], undefined, {
        model: 'llama3',
      });

      expect(mockOllamaChat).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'llama3' }),
      );
    });

    it('should pass tools to Ollama', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Response' },
        prompt_eval_count: 10,
        eval_count: 20,
      });

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];

      await provider.chat([{ role: 'user', content: 'Test' }], tools);

      expect(mockOllamaChat).toHaveBeenCalledWith(
        expect.objectContaining({ tools }),
      );
    });

    it('should include legacy fields for backward compatibility', async () => {
      mockOllamaChat.mockResolvedValue({
        message: { role: 'assistant', content: 'Response' },
        prompt_eval_count: 10,
        eval_count: 20,
        total_duration: 1000,
        load_duration: 200,
        prompt_eval_duration: 300,
        eval_duration: 400,
      });

      const result = await provider.chat([{ role: 'user', content: 'Test' }]);

      // Legacy fields for backward compatibility
      expect(result.prompt_eval_count).toBe(10);
      expect(result.eval_count).toBe(20);
      expect(result.total_duration).toBe(1000);
    });
  });
});
