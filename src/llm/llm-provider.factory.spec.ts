import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LLMProviderFactory } from './llm-provider.factory';
import { OllamaProvider } from './providers/ollama.provider';
import { AzureMistralProvider } from './providers/azure-mistral.provider';

describe('LLMProviderFactory', () => {
  let factory: LLMProviderFactory;
  let configService: jest.Mocked<ConfigService>;
  let ollamaProvider: jest.Mocked<OllamaProvider>;
  let azureMistralProvider: jest.Mocked<AzureMistralProvider>;

  beforeEach(async () => {
    ollamaProvider = {
      name: 'ollama',
      supportsToolCalling: true,
      chat: jest.fn(),
      getProviderMetadata: jest.fn().mockReturnValue({
        name: 'ollama',
        model: 'qwen2.5',
        supportedFeatures: ['chat', 'tool_calling'],
      }),
    } as any;

    azureMistralProvider = {
      name: 'azure-mistral',
      supportsToolCalling: true,
      chat: jest.fn(),
      getProviderMetadata: jest.fn().mockReturnValue({
        name: 'azure-mistral',
        model: 'Mistral-Large-3',
        supportedFeatures: ['chat', 'tool_calling'],
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMProviderFactory,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: OllamaProvider,
          useValue: ollamaProvider,
        },
        {
          provide: AzureMistralProvider,
          useValue: azureMistralProvider,
        },
      ],
    }).compile();

    factory = module.get<LLMProviderFactory>(LLMProviderFactory);
    configService = module.get(ConfigService);
  });

  describe('getProvider', () => {
    it('should return Ollama provider when LLM_PROVIDER is "ollama"', () => {
      configService.get.mockReturnValue('ollama');

      const provider = factory.getProvider();

      expect(provider).toBe(ollamaProvider);
      expect(provider.name).toBe('ollama');
    });

    it('should return Azure Mistral provider when LLM_PROVIDER is "azure-mistral"', () => {
      configService.get.mockReturnValue('azure-mistral');

      const provider = factory.getProvider();

      expect(provider).toBe(azureMistralProvider);
      expect(provider.name).toBe('azure-mistral');
    });

    it('should default to Ollama provider when LLM_PROVIDER is not set', () => {
      configService.get.mockReturnValue(undefined);

      const provider = factory.getProvider();

      expect(provider).toBe(ollamaProvider);
    });

    it('should default to Ollama provider when LLM_PROVIDER is invalid', () => {
      configService.get.mockReturnValue('invalid-provider');

      const provider = factory.getProvider();

      expect(provider).toBe(ollamaProvider);
    });

    it('should handle case-insensitive provider names', () => {
      configService.get.mockReturnValue('AZURE-MISTRAL');

      const provider = factory.getProvider();

      expect(provider).toBe(azureMistralProvider);
    });

    it('should handle mixed case provider names', () => {
      configService.get.mockReturnValue('Azure-Mistral');

      const provider = factory.getProvider();

      expect(provider).toBe(azureMistralProvider);
    });
  });

  describe('getProviderByName', () => {
    it('should return Ollama provider for "ollama"', () => {
      const provider = factory.getProviderByName('ollama');

      expect(provider).toBe(ollamaProvider);
    });

    it('should return Azure Mistral provider for "azure-mistral"', () => {
      const provider = factory.getProviderByName('azure-mistral');

      expect(provider).toBe(azureMistralProvider);
    });

    it('should default to Ollama when name is undefined', () => {
      const provider = factory.getProviderByName(undefined);

      expect(provider).toBe(ollamaProvider);
    });

    it('should default to Ollama when name is empty string', () => {
      const provider = factory.getProviderByName('');

      expect(provider).toBe(ollamaProvider);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of available provider names', () => {
      const providers = factory.getAvailableProviders();

      expect(providers).toContain('ollama');
      expect(providers).toContain('azure-mistral');
      expect(providers).toHaveLength(2);
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true for Ollama (always available)', () => {
      const available = factory.isProviderAvailable('ollama');

      expect(available).toBe(true);
    });

    it('should return true for Azure Mistral when configured', () => {
      configService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          AZURE_OPENAI_ENDPOINT: 'https://test.azure.com/openai/v1/',
          AZURE_OPENAI_API_KEY: 'test-key',
        };
        return config[key];
      });

      const available = factory.isProviderAvailable('azure-mistral');

      expect(available).toBe(true);
    });

    it('should return false for Azure Mistral when endpoint is missing', () => {
      configService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          AZURE_OPENAI_API_KEY: 'test-key',
        };
        return config[key];
      });

      const available = factory.isProviderAvailable('azure-mistral');

      expect(available).toBe(false);
    });

    it('should return false for Azure Mistral when API key is missing', () => {
      configService.get.mockImplementation((key: string) => {
        const config: Record<string, string> = {
          AZURE_OPENAI_ENDPOINT: 'https://test.azure.com/openai/v1/',
        };
        return config[key];
      });

      const available = factory.isProviderAvailable('azure-mistral');

      expect(available).toBe(false);
    });

    it('should return false for Azure Mistral when both endpoint and key are missing', () => {
      configService.get.mockReturnValue(undefined);

      const available = factory.isProviderAvailable('azure-mistral');

      expect(available).toBe(false);
    });

    it('should return false for unknown provider', () => {
      const available = factory.isProviderAvailable('unknown' as any);

      expect(available).toBe(false);
    });
  });
});
