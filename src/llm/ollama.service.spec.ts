import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OllamaService } from './ollama.service';
import { Ollama } from 'ollama';

jest.mock('ollama');

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

  it('should call Ollama chat API', async () => {
    const mockResponse = {
      message: {
        role: 'assistant',
        content: 'Test response',
      },
    };
    mockOllama.chat.mockResolvedValue(mockResponse as any);

    const messages = [{ role: 'user' as const, content: 'Test' }];
    const result = await service.chat(messages);

    expect(result.message.content).toBe('Test response');
    expect(mockOllama.chat).toHaveBeenCalledWith({
      model: 'qwen2.5',
      messages,
      tools: undefined,
    });
  });

  it('should support tools in chat', async () => {
    const mockResponse = {
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'test_tool', arguments: {} } }],
      },
    };
    mockOllama.chat.mockResolvedValue(mockResponse as any);

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
  });
});
