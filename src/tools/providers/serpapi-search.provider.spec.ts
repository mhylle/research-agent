import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SerpApiSearchProvider } from './serpapi-search.provider';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SerpApiSearchProvider', () => {
  let provider: SerpApiSearchProvider;
  let configService: ConfigService;

  const mockApiKey = 'test-serpapi-key';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SerpApiSearchProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SERPAPI_API_KEY') return mockApiKey;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<SerpApiSearchProvider>(SerpApiSearchProvider);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Definition', () => {
    it('should have correct tool definition', () => {
      expect(provider.definition).toBeDefined();
      expect(provider.definition.type).toBe('function');
      expect(provider.definition.function.name).toBe('serpapi_search');
      expect(provider.definition.function.description).toContain(
        'Google search results',
      );
    });

    it('should require API key', () => {
      expect(provider.requiresApiKey).toBe(true);
    });

    it('should have query as required parameter', () => {
      const params = provider.definition.function.parameters;
      expect(params.required).toContain('query');
    });

    it('should have max_results as optional parameter', () => {
      const params = provider.definition.function.parameters;
      expect(params.properties.max_results).toBeDefined();
      expect(params.required).not.toContain('max_results');
    });
  });

  describe('Argument Validation', () => {
    it('should validate valid arguments', () => {
      const args = { query: 'test query', max_results: 10 };
      expect(() => (provider as any).validateArgs(args)).not.toThrow();
    });

    it('should throw error for missing query', () => {
      const args = {};
      expect(() => (provider as any).validateArgs(args)).toThrow(
        'serpapi_search: query must be a non-empty string',
      );
    });

    it('should throw error for empty query', () => {
      const args = { query: '' };
      expect(() => (provider as any).validateArgs(args)).toThrow(
        'serpapi_search: query must be a non-empty string',
      );
    });

    it('should throw error for non-string query', () => {
      const args = { query: 123 };
      expect(() => (provider as any).validateArgs(args)).toThrow(
        'serpapi_search: query must be a non-empty string',
      );
    });

    it('should throw error for non-number max_results', () => {
      const args = { query: 'test', max_results: 'invalid' };
      expect(() => (provider as any).validateArgs(args)).toThrow(
        'serpapi_search: max_results must be a number',
      );
    });

    it('should accept valid query without max_results', () => {
      const args = { query: 'test query' };
      const validated = (provider as any).validateArgs(args);
      expect(validated.query).toBe('test query');
      expect(validated.max_results).toBeUndefined();
    });
  });

  describe('API Key Configuration', () => {
    it('should retrieve API key from ConfigService', () => {
      expect(provider.apiKey).toBe(mockApiKey);
      expect(configService.get).toHaveBeenCalledWith('SERPAPI_API_KEY');
    });

    it('should handle missing API key gracefully', async () => {
      const moduleWithoutKey = await Test.createTestingModule({
        providers: [
          SerpApiSearchProvider,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => undefined),
            },
          },
        ],
      }).compile();

      const providerWithoutKey = moduleWithoutKey.get<SerpApiSearchProvider>(
        SerpApiSearchProvider,
      );
      expect(providerWithoutKey.apiKey).toBe('');
    });
  });

  describe('Execute Method', () => {
    const mockSerpApiResponse = {
      data: {
        organic_results: [
          {
            title: 'First Result',
            link: 'https://example.com/1',
            snippet: 'This is the first result snippet',
          },
          {
            title: 'Second Result',
            link: 'https://example.com/2',
            snippet: 'This is the second result snippet',
          },
        ],
      },
    };

    beforeEach(() => {
      mockedAxios.get.mockResolvedValue(mockSerpApiResponse);
    });

    it('should successfully execute search with default parameters', async () => {
      const args = { query: 'test query' };
      const results = await provider.execute(args);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: 'First Result',
        url: 'https://example.com/1',
        content: 'This is the first result snippet',
      });
      expect(results[1]).toEqual({
        title: 'Second Result',
        url: 'https://example.com/2',
        content: 'This is the second result snippet',
      });
    });

    it('should call SerpAPI with correct parameters', async () => {
      const args = { query: 'test query', max_results: 10 };
      await provider.execute(args);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://serpapi.com/search',
        {
          params: {
            q: 'test query',
            api_key: mockApiKey,
            num: 10,
          },
          timeout: 10000,
        },
      );
    });

    it('should use default max_results of 5 when not provided', async () => {
      const args = { query: 'test query' };
      await provider.execute(args);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://serpapi.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            num: 5,
          }),
        }),
      );
    });

    it('should handle empty results', async () => {
      mockedAxios.get.mockResolvedValue({ data: { organic_results: [] } });

      const args = { query: 'no results query' };
      const results = await provider.execute(args);

      expect(results).toEqual([]);
    });

    it('should handle missing organic_results field', async () => {
      mockedAxios.get.mockResolvedValue({ data: {} });

      const args = { query: 'test query' };
      const results = await provider.execute(args);

      expect(results).toEqual([]);
    });

    it('should map SerpAPI results to SearchResult interface', async () => {
      const args = { query: 'test query' };
      const results = await provider.execute(args);

      results.forEach((result) => {
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('content');
        expect(typeof result.title).toBe('string');
        expect(typeof result.url).toBe('string');
        expect(typeof result.content).toBe('string');
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw error when API request fails', async () => {
      const apiError = new Error('Network error');
      mockedAxios.get.mockRejectedValue(apiError);

      const args = { query: 'test query' };

      await expect(provider.execute(args)).rejects.toThrow(
        'SerpAPI search failed: Network error',
      );
    });

    it('should throw error for invalid arguments', async () => {
      const args = { query: '' };

      await expect(provider.execute(args)).rejects.toThrow(
        'serpapi_search: query must be a non-empty string',
      );
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('timeout of 10000ms exceeded');
      mockedAxios.get.mockRejectedValue(timeoutError);

      const args = { query: 'test query' };

      await expect(provider.execute(args)).rejects.toThrow(
        'SerpAPI search failed: timeout of 10000ms exceeded',
      );
    });

    it('should handle API authentication errors', async () => {
      const authError = new Error('Invalid API key');
      mockedAxios.get.mockRejectedValue(authError);

      const args = { query: 'test query' };

      await expect(provider.execute(args)).rejects.toThrow(
        'SerpAPI search failed: Invalid API key',
      );
    });
  });

  describe('Logging', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should log search execution', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { organic_results: [] },
      });

      const args = { query: 'test query', max_results: 5 };
      await provider.execute(args);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SerpApiSearchProvider] Executing search'),
      );
    });

    it('should log successful completion', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          organic_results: [
            { title: 'Test', link: 'http://test.com', snippet: 'Test snippet' },
          ],
        },
      });

      const args = { query: 'test query' };
      await provider.execute(args);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Search completed successfully'),
      );
    });

    it('should log errors', async () => {
      const error = new Error('API error');
      mockedAxios.get.mockRejectedValue(error);

      const args = { query: 'test query' };

      await expect(provider.execute(args)).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SerpApiSearchProvider]'),
      );
    });
  });
});
