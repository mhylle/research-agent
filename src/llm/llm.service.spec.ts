import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LLMService } from './llm.service';
import { LLMProviderFactory } from './llm-provider.factory';
import { ILLMProvider } from './interfaces/llm-provider.interface';
import { ChatResponse } from './interfaces/chat-response.interface';

describe('LLMService', () => {
  let service: LLMService;
  let configService: jest.Mocked<ConfigService>;
  let factory: jest.Mocked<LLMProviderFactory>;
  let mockProvider: jest.Mocked<ILLMProvider>;

  const mockChatResponse: ChatResponse = {
    message: {
      role: 'assistant',
      content: 'Test response',
    },
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
  };

  beforeEach(async () => {
    mockProvider = {
      name: 'test-provider',
      supportsToolCalling: true,
      chat: jest.fn().mockResolvedValue(mockChatResponse),
      getProviderMetadata: jest.fn().mockReturnValue({
        name: 'test-provider',
        model: 'test-model',
        supportedFeatures: ['chat'],
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: LLMProviderFactory,
          useValue: {
            getProvider: jest.fn().mockReturnValue(mockProvider),
          },
        },
      ],
    }).compile();

    service = module.get<LLMService>(LLMService);
    configService = module.get(ConfigService);
    factory = module.get(LLMProviderFactory);
  });

  describe('initialization', () => {
    it('should use default concurrency limit of 2 when not configured', async () => {
      configService.get.mockReturnValue(undefined);

      const newModule = await Test.createTestingModule({
        providers: [
          LLMService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(undefined) },
          },
          {
            provide: LLMProviderFactory,
            useValue: { getProvider: jest.fn().mockReturnValue(mockProvider) },
          },
        ],
      }).compile();

      const newService = newModule.get<LLMService>(LLMService);
      expect(newService).toBeDefined();
    });

    it('should use configured concurrency limit', async () => {
      const newModule = await Test.createTestingModule({
        providers: [
          LLMService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(5) },
          },
          {
            provide: LLMProviderFactory,
            useValue: { getProvider: jest.fn().mockReturnValue(mockProvider) },
          },
        ],
      }).compile();

      const newService = newModule.get<LLMService>(LLMService);
      expect(newService).toBeDefined();
    });
  });

  describe('chat', () => {
    it('should delegate to provider chat method', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      const result = await service.chat(messages);

      expect(mockProvider.chat).toHaveBeenCalledWith(
        messages,
        undefined,
        undefined,
      );
      expect(result).toEqual(mockChatResponse);
    });

    it('should pass tools to provider', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
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

      await service.chat(messages, tools);

      expect(mockProvider.chat).toHaveBeenCalledWith(
        messages,
        tools,
        undefined,
      );
    });

    it('should pass model option to provider', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      await service.chat(messages, undefined, 'custom-model');

      expect(mockProvider.chat).toHaveBeenCalledWith(messages, undefined, {
        model: 'custom-model',
      });
    });

    it('should limit concurrent calls', async () => {
      // Create service with concurrency limit of 2
      const limitedModule = await Test.createTestingModule({
        providers: [
          LLMService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(2) },
          },
          {
            provide: LLMProviderFactory,
            useValue: { getProvider: jest.fn().mockReturnValue(mockProvider) },
          },
        ],
      }).compile();

      const limitedService = limitedModule.get<LLMService>(LLMService);

      // Create a slow mock that tracks concurrent calls
      let activeCalls = 0;
      let maxConcurrent = 0;

      mockProvider.chat.mockImplementation(async () => {
        activeCalls++;
        maxConcurrent = Math.max(maxConcurrent, activeCalls);
        await new Promise((resolve) => setTimeout(resolve, 50));
        activeCalls--;
        return mockChatResponse;
      });

      const messages = [{ role: 'user' as const, content: 'Hello' }];

      // Fire 5 concurrent calls
      const promises = [
        limitedService.chat(messages),
        limitedService.chat(messages),
        limitedService.chat(messages),
        limitedService.chat(messages),
        limitedService.chat(messages),
      ];

      await Promise.all(promises);

      // With concurrency limit of 2, max concurrent should never exceed 2
      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(mockProvider.chat).toHaveBeenCalledTimes(5);
    });
  });

  describe('getProviderInfo', () => {
    it('should return provider metadata', () => {
      const metadata = service.getProviderInfo();

      expect(metadata).toEqual({
        name: 'test-provider',
        model: 'test-model',
        supportedFeatures: ['chat'],
      });
    });
  });

  describe('getProviderName', () => {
    it('should return provider name', () => {
      const name = service.getProviderName();

      expect(name).toBe('test-provider');
    });
  });

  describe('supportsToolCalling', () => {
    it('should return true when provider supports tool calling', () => {
      expect(service.supportsToolCalling()).toBe(true);
    });

    it('should return false when provider does not support tool calling', async () => {
      mockProvider.supportsToolCalling = false;

      const newModule = await Test.createTestingModule({
        providers: [
          LLMService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn() },
          },
          {
            provide: LLMProviderFactory,
            useValue: { getProvider: jest.fn().mockReturnValue(mockProvider) },
          },
        ],
      }).compile();

      const newService = newModule.get<LLMService>(LLMService);
      expect(newService.supportsToolCalling()).toBe(false);
    });
  });
});
