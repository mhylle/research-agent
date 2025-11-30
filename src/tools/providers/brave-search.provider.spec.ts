import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BraveSearchProvider } from './brave-search.provider';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BraveSearchProvider', () => {
  let provider: BraveSearchProvider;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BraveSearchProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'BRAVE_API_KEY') return 'test-brave-api-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<BraveSearchProvider>(BraveSearchProvider);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should have requiresApiKey set to true', () => {
    expect(provider.requiresApiKey).toBe(true);
  });

  it('should have correct tool definition', () => {
    expect(provider.definition.function.name).toBe('brave_search');
    expect(provider.definition.function.description).toContain(
      'Independent search index',
    );
    expect(provider.definition.function.parameters.required).toContain('query');
    expect(
      provider.definition.function.parameters.properties.query.type,
    ).toBe('string');
    expect(
      provider.definition.function.parameters.properties.max_results.type,
    ).toBe('number');
  });

  it('should load API key from config', () => {
    expect(provider.apiKey).toBe('test-brave-api-key');
    expect(configService.get).toHaveBeenCalledWith('BRAVE_API_KEY');
  });

  describe('argument validation', () => {
    it('should throw error if query is missing', async () => {
      await expect(provider.execute({})).rejects.toThrow(
        'brave_search: query must be a non-empty string',
      );
    });

    it('should throw error if query is not a string', async () => {
      await expect(provider.execute({ query: 123 })).rejects.toThrow(
        'brave_search: query must be a non-empty string',
      );
    });

    it('should throw error if query is empty string', async () => {
      await expect(provider.execute({ query: '' })).rejects.toThrow(
        'brave_search: query must be a non-empty string',
      );
    });

    it('should throw error if max_results is not a number', async () => {
      await expect(
        provider.execute({ query: 'test', max_results: 'invalid' }),
      ).rejects.toThrow('brave_search: max_results must be a number');
    });

    it('should accept valid query', async () => {
      const mockResponse = {
        data: {
          web: {
            results: [],
          },
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      await expect(provider.execute({ query: 'test query' })).resolves.toEqual(
        [],
      );
    });

    it('should accept valid query with max_results', async () => {
      const mockResponse = {
        data: {
          web: {
            results: [],
          },
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      await expect(
        provider.execute({ query: 'test query', max_results: 10 }),
      ).resolves.toEqual([]);
    });
  });

  describe('execute', () => {
    it('should execute search and return results', async () => {
      const mockResponse = {
        data: {
          web: {
            results: [
              {
                title: 'Brave Search Result 1',
                url: 'https://brave-result1.com',
                description: 'First Brave search result content',
              },
              {
                title: 'Brave Search Result 2',
                url: 'https://brave-result2.com',
                description: 'Second Brave search result content',
              },
            ],
          },
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test query' });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: 'Brave Search Result 1',
        url: 'https://brave-result1.com',
        content: 'First Brave search result content',
      });
      expect(result[1]).toEqual({
        title: 'Brave Search Result 2',
        url: 'https://brave-result2.com',
        content: 'Second Brave search result content',
      });
    });

    it('should call Brave API with correct parameters', async () => {
      const mockResponse = {
        data: {
          web: {
            results: [],
          },
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      await provider.execute({ query: 'test query', max_results: 10 });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.search.brave.com/res/v1/web/search',
        {
          params: {
            q: 'test query',
            count: 10,
          },
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': 'test-brave-api-key',
          },
          timeout: 10000,
        },
      );
    });

    it('should use default max_results of 5', async () => {
      const mockResponse = {
        data: {
          web: {
            results: [],
          },
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      await provider.execute({ query: 'test query' });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            count: 5,
          }),
        }),
      );
    });

    it('should handle empty results', async () => {
      const mockResponse = {
        data: {
          web: {
            results: [],
          },
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test query' });

      expect(result).toEqual([]);
    });

    it('should handle missing web.results in response', async () => {
      const mockResponse = {
        data: {},
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test query' });

      expect(result).toEqual([]);
    });

    it('should handle API timeout error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('timeout of 10000ms exceeded'));

      await expect(provider.execute({ query: 'test query' })).rejects.toThrow(
        'Brave search failed: timeout of 10000ms exceeded',
      );
    });

    it('should handle API authentication error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('401 Unauthorized'));

      await expect(provider.execute({ query: 'test query' })).rejects.toThrow(
        'Brave search failed: 401 Unauthorized',
      );
    });

    it('should handle API rate limit error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('429 Too Many Requests'));

      await expect(provider.execute({ query: 'test query' })).rejects.toThrow(
        'Brave search failed: 429 Too Many Requests',
      );
    });

    it('should handle network error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      await expect(provider.execute({ query: 'test query' })).rejects.toThrow(
        'Brave search failed: Network Error',
      );
    });
  });

  describe('API key handling', () => {
    it('should handle missing API key', async () => {
      const moduleWithoutKey: TestingModule = await Test.createTestingModule({
        providers: [
          BraveSearchProvider,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => null),
            },
          },
        ],
      }).compile();

      const providerWithoutKey =
        moduleWithoutKey.get<BraveSearchProvider>(BraveSearchProvider);

      expect(providerWithoutKey.apiKey).toBe('');
    });

    it('should handle empty API key', async () => {
      const moduleWithEmptyKey: TestingModule =
        await Test.createTestingModule({
          providers: [
            BraveSearchProvider,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => ''),
              },
            },
          ],
        }).compile();

      const providerWithEmptyKey =
        moduleWithEmptyKey.get<BraveSearchProvider>(BraveSearchProvider);

      expect(providerWithEmptyKey.apiKey).toBe('');
    });
  });
});
