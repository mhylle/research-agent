import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OllamaService } from '../src/llm/ollama.service';
import { TavilySearchProvider } from '../src/tools/providers/tavily-search.provider';

describe('Research Pipeline (e2e)', () => {
  let app: INestApplication;
  let ollamaService: OllamaService;
  let tavilyProvider: TavilySearchProvider;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OllamaService)
      .useValue({
        chat: jest.fn(),
      })
      .overrideProvider(TavilySearchProvider)
      .useValue({
        definition: {
          type: 'function',
          function: {
            name: 'tavily_search',
            description: 'Search the web for information',
            parameters: {
              type: 'object',
              required: ['query'],
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query',
                },
              },
            },
          },
        },
        execute: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    ollamaService = moduleFixture.get<OllamaService>(OllamaService);
    tavilyProvider =
      moduleFixture.get<TavilySearchProvider>(TavilySearchProvider);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('/api/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
          expect(res.body).toHaveProperty('services');
          expect(res.body.services).toHaveProperty('ollama');
          expect(res.body.services).toHaveProperty('tavily');
        });
    });
  });

  describe('/api/research/query (POST)', () => {
    it('should reject invalid request without query field', () => {
      return request(app.getHttpServer())
        .post('/api/research/query')
        .send({ invalid: 'data' })
        .expect(400);
    });

    it('should reject request with invalid maxSources', () => {
      return request(app.getHttpServer())
        .post('/api/research/query')
        .send({ query: 'test', maxSources: 100 })
        .expect(400);
    });

    it('should execute full 3-stage pipeline', async () => {
      // Mock Stage 1: Query Analysis & Search
      (ollamaService.chat as jest.Mock).mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'Analyzing query and searching...',
          tool_calls: [
            {
              function: {
                name: 'tavily_search',
                arguments: { query: 'test query' },
              },
            },
          ],
        },
      });

      // Mock Tavily search results
      (tavilyProvider.execute as jest.Mock).mockResolvedValueOnce([
        {
          title: 'Test Result 1',
          url: 'https://example.com/1',
          content: 'Test content 1',
          score: 0.9,
        },
        {
          title: 'Test Result 2',
          url: 'https://example.com/2',
          content: 'Test content 2',
          score: 0.8,
        },
      ]);

      // Mock Stage 2: Source Selection (no web_fetch in this test)
      (ollamaService.chat as jest.Mock).mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'Selecting sources...',
          tool_calls: [],
        },
      });

      // Mock Stage 3: Synthesis
      (ollamaService.chat as jest.Mock).mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'Final synthesized answer based on research',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/api/research/query')
        .send({
          query: 'What is artificial intelligence?',
          maxSources: 5,
          searchDepth: 'comprehensive',
        })
        .expect(201);

      // Validate response structure
      expect(response.body).toHaveProperty('logId');
      expect(response.body).toHaveProperty('answer');
      expect(response.body).toHaveProperty('sources');
      expect(response.body).toHaveProperty('metadata');

      // Validate answer
      expect(response.body.answer).toBe(
        'Final synthesized answer based on research',
      );

      // Validate sources
      expect(Array.isArray(response.body.sources)).toBe(true);
      expect(response.body.sources.length).toBeGreaterThan(0);
      expect(response.body.sources[0]).toHaveProperty('url');
      expect(response.body.sources[0]).toHaveProperty('title');

      // Validate metadata
      expect(response.body.metadata).toHaveProperty('totalExecutionTime');
      expect(response.body.metadata).toHaveProperty('stages');
      expect(Array.isArray(response.body.metadata.stages)).toBe(true);
      expect(response.body.metadata.stages).toHaveLength(3);

      // Verify 3-stage execution
      response.body.metadata.stages.forEach((stage: any, index: number) => {
        expect(stage).toHaveProperty('stage');
        expect(stage).toHaveProperty('executionTime');
        expect(stage.stage).toBe(index + 1);
        expect(stage.executionTime).toBeGreaterThanOrEqual(0);
      });

      // Verify Ollama was called 3 times (once per stage)
      expect(ollamaService.chat).toHaveBeenCalledTimes(3);

      // Verify Tavily was called once
      expect(tavilyProvider.execute).toHaveBeenCalledTimes(1);
    });

    it('should handle default values for optional parameters', async () => {
      // Mock responses for pipeline stages
      (ollamaService.chat as jest.Mock)
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Stage 1',
            tool_calls: [],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Stage 2',
            tool_calls: [],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Final answer',
          },
        });

      const response = await request(app.getHttpServer())
        .post('/api/research/query')
        .send({ query: 'test query' })
        .expect(201);

      expect(response.body).toHaveProperty('answer');
      expect(response.body.answer).toBe('Final answer');
    });
  });
});
