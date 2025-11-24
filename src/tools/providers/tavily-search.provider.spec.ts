import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TavilySearchProvider } from './tavily-search.provider';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TavilySearchProvider', () => {
  let provider: TavilySearchProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TavilySearchProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'TAVILY_API_KEY') return 'test-api-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<TavilySearchProvider>(TavilySearchProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should have correct tool definition', () => {
    expect(provider.definition.function.name).toBe('tavily_search');
    expect(provider.definition.function.parameters.required).toContain('query');
  });

  it('should execute search and return results', async () => {
    const mockResponse = {
      data: {
        results: [
          {
            title: 'Test',
            url: 'https://test.com',
            content: 'Test content',
            score: 0.9,
          },
        ],
      },
    };
    mockedAxios.post.mockResolvedValue(mockResponse);

    const result = await provider.execute({ query: 'test query' });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({ query: 'test query' }),
      expect.any(Object),
    );
  });

  it('should handle max_results parameter', async () => {
    mockedAxios.post.mockResolvedValue({ data: { results: [] } });

    await provider.execute({ query: 'test', max_results: 10 });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({ max_results: 10 }),
      expect.any(Object),
    );
  });
});
