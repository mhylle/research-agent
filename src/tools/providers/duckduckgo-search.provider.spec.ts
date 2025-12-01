import { Test, TestingModule } from '@nestjs/testing';
import { DuckDuckGoSearchProvider } from './duckduckgo-search.provider';
import { ResearchLogger } from '../../logging/research-logger.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DuckDuckGoSearchProvider', () => {
  let provider: DuckDuckGoSearchProvider;
  let mockLogger: jest.Mocked<ResearchLogger>;

  beforeEach(async () => {
    mockLogger = {
      logToolExecution: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuckDuckGoSearchProvider,
        {
          provide: ResearchLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    provider = module.get<DuckDuckGoSearchProvider>(DuckDuckGoSearchProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should have correct tool definition', () => {
    expect(provider.definition.function.name).toBe('duckduckgo_search');
    expect(provider.definition.function.parameters.required).toContain('query');
    expect(provider.requiresApiKey).toBe(false);
  });

  describe('execute', () => {
    it('should execute search and return abstract result', async () => {
      const mockResponse = {
        data: {
          Abstract: 'Test abstract content',
          AbstractText: 'Test abstract content',
          AbstractURL: 'https://test.com',
          Heading: 'Test Heading',
          RelatedTopics: [],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test query' });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Heading');
      expect(result[0].content).toBe('Test abstract content');
      expect(result[0].url).toBe('https://test.com');
      expect(result[0].score).toBe(1.0);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.duckduckgo.com/',
        expect.objectContaining({
          params: expect.objectContaining({ q: 'test query' }),
        }),
      );
    });

    it('should extract related topics', async () => {
      const mockResponse = {
        data: {
          Abstract: '',
          AbstractText: '',
          Heading: 'Test',
          RelatedTopics: [
            {
              Text: 'Topic 1 - Description 1',
              FirstURL: 'https://topic1.com',
            },
            {
              Text: 'Topic 2 - Description 2',
              FirstURL: 'https://topic2.com',
            },
          ],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test query' });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].title).toBe('Topic 1');
      expect(result[0].url).toBe('https://topic1.com');
      expect(result[0].score).toBe(0.8);
    });

    it('should handle nested topics', async () => {
      const mockResponse = {
        data: {
          Abstract: '',
          AbstractText: '',
          Heading: 'Test',
          RelatedTopics: [
            {
              Name: 'Category',
              Topics: [
                {
                  Text: 'Nested Topic - Description',
                  FirstURL: 'https://nested.com',
                },
              ],
            },
          ],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test query' });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Nested Topic');
      expect(result[0].url).toBe('https://nested.com');
      expect(result[0].score).toBe(0.7);
    });

    it('should respect max_results parameter', async () => {
      const mockResponse = {
        data: {
          Abstract: 'Abstract',
          AbstractText: 'Abstract text',
          AbstractURL: 'https://test.com',
          Heading: 'Test',
          RelatedTopics: [
            { Text: 'Topic 1', FirstURL: 'https://1.com' },
            { Text: 'Topic 2', FirstURL: 'https://2.com' },
            { Text: 'Topic 3', FirstURL: 'https://3.com' },
          ],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test', max_results: 2 });

      expect(result).toHaveLength(2); // Abstract + 1 topic
    });

    it('should handle minimal response with only heading', async () => {
      const mockResponse = {
        data: {
          Heading: 'Test Heading',
          Abstract: '',
          AbstractText: '',
          RelatedTopics: [],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test query' });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Heading');
      expect(result[0].content).toContain('No detailed information');
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(provider.execute({ query: 'test query' })).rejects.toThrow(
        'DuckDuckGo search failed: Network error',
      );
    });

    it('should validate query argument', async () => {
      await expect(provider.execute({ query: '' })).rejects.toThrow(
        'query must be a non-empty string',
      );

      await expect(provider.execute({ query: 123 })).rejects.toThrow(
        'query must be a non-empty string',
      );

      await expect(provider.execute({})).rejects.toThrow(
        'query must be a non-empty string',
      );
    });

    it('should validate max_results argument', async () => {
      await expect(
        provider.execute({ query: 'test', max_results: 'invalid' }),
      ).rejects.toThrow('max_results must be a number');
    });

    it('should use default max_results when not provided', async () => {
      const mockResponse = {
        data: {
          Abstract: 'Abstract',
          AbstractText: 'Abstract text',
          AbstractURL: 'https://test.com',
          Heading: 'Test',
          RelatedTopics: Array(10)
            .fill(null)
            .map((_, i) => ({
              Text: `Topic ${i}`,
              FirstURL: `https://${i}.com`,
            })),
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test' });

      expect(result).toHaveLength(5); // Default max_results is 5
    });
  });

  describe('title extraction', () => {
    it('should extract title before separator', async () => {
      const mockResponse = {
        data: {
          Abstract: '',
          AbstractText: '',
          Heading: 'Test',
          RelatedTopics: [
            { Text: 'Title - Description here', FirstURL: 'https://test.com' },
          ],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test' });

      expect(result[0].title).toBe('Title');
    });

    it('should handle long text without separator', async () => {
      const longText = 'A'.repeat(150);
      const mockResponse = {
        data: {
          Abstract: '',
          AbstractText: '',
          Heading: 'Test',
          RelatedTopics: [{ Text: longText, FirstURL: 'https://test.com' }],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await provider.execute({ query: 'test' });

      expect(result[0].title.length).toBeLessThanOrEqual(100);
      expect(result[0].title).toContain('...');
    });
  });
});
