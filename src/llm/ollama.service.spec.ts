import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OllamaService } from './ollama.service';
import { Ollama } from 'ollama';

jest.mock('ollama');

// Helper to create async iterable from array (simulates streaming)
async function* createAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe('OllamaService', () => {
  let service: OllamaService;
  let mockOllama: jest.Mocked<Ollama>;

  beforeEach(async () => {
    mockOllama = {
      chat: jest.fn(),
    } as any;

    (Ollama as jest.MockedClass<typeof Ollama>).mockImplementation(
      () => mockOllama,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OllamaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                OLLAMA_BASE_URL: 'http://localhost:11434',
                OLLAMA_MODEL: 'qwen2.5',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OllamaService>(OllamaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call Ollama chat API with streaming', async () => {
    // Mock streaming response - multiple chunks followed by final chunk
    const streamChunks = [
      { message: { content: 'Test ' }, done: false },
      { message: { content: 'response' }, done: false },
      {
        message: { role: 'assistant', content: '' },
        done: true,
        prompt_eval_count: 10,
        eval_count: 5,
      },
    ];
    mockOllama.chat.mockResolvedValue(createAsyncIterable(streamChunks) as any);

    const messages = [{ role: 'user' as const, content: 'Test' }];
    const result = await service.chat(messages);

    expect(result.message.content).toBe('Test response');
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
    expect(mockOllama.chat).toHaveBeenCalledWith({
      model: 'qwen2.5',
      messages,
      tools: undefined,
      stream: true,
    });
  });

  it('should support tools in chat with streaming', async () => {
    const streamChunks = [
      { message: { content: '' }, done: false },
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'test_tool', arguments: {} } }],
        },
        done: true,
        prompt_eval_count: 15,
        eval_count: 3,
      },
    ];
    mockOllama.chat.mockResolvedValue(createAsyncIterable(streamChunks) as any);

    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'test_tool',
          description: 'Test',
          parameters: { type: 'object' as const, required: [], properties: {} },
        },
      },
    ];
    const result = await service.chat([], tools as any);

    expect(result.message.tool_calls).toHaveLength(1);
    expect(result.message.tool_calls![0].function.name).toBe('test_tool');
  });

  it('should throw error when stream ends without final response', async () => {
    // Mock stream that ends without done: true
    const streamChunks = [{ message: { content: 'Partial' }, done: false }];
    mockOllama.chat.mockResolvedValue(createAsyncIterable(streamChunks) as any);

    const messages = [{ role: 'user' as const, content: 'Test' }];

    await expect(service.chat(messages)).rejects.toThrow(
      'Ollama chat failed: Stream ended without final response',
    );
  });

  it('should handle empty content gracefully', async () => {
    const streamChunks = [
      {
        message: { role: 'assistant', content: '' },
        done: true,
        prompt_eval_count: 5,
        eval_count: 0,
      },
    ];
    mockOllama.chat.mockResolvedValue(createAsyncIterable(streamChunks) as any);

    const result = await service.chat([
      { role: 'user' as const, content: 'Test' },
    ]);

    expect(result.message.content).toBe('');
  });

  it('should handle streaming errors', async () => {
    mockOllama.chat.mockRejectedValue(new Error('Connection refused'));

    const messages = [{ role: 'user' as const, content: 'Test' }];

    await expect(service.chat(messages)).rejects.toThrow(
      'Ollama chat failed: Connection refused',
    );
  });
});
