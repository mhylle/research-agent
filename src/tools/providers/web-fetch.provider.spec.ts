import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebFetchProvider } from './web-fetch.provider';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebFetchProvider', () => {
  let provider: WebFetchProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebFetchProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                WEB_FETCH_TIMEOUT: 10000,
                WEB_FETCH_MAX_SIZE: 1048576,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<WebFetchProvider>(WebFetchProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should have correct tool definition', () => {
    expect(provider.definition.function.name).toBe('web_fetch');
    expect(provider.definition.function.parameters.required).toContain('url');
  });

  it('should fetch web content', async () => {
    const mockHtml = '<html><body><h1>Test</h1></body></html>';
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const result = await provider.execute({ url: 'https://test.com' });

    expect(result.url).toBe('https://test.com');
    expect(result.content).toContain('Test');
  });

  it('should handle fetch errors', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    await expect(
      provider.execute({ url: 'https://test.com' })
    ).rejects.toThrow('Web fetch failed');
  });
});
