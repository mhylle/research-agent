import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OllamaService } from '../src/llm/ollama.service';
import { TavilySearchProvider } from '../src/tools/providers/tavily-search.provider';
import { EvaluationService } from '../src/evaluation/services/evaluation.service';

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
        generateResponse: jest.fn(),
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
      .overrideProvider(EvaluationService)
      .useValue({
        evaluateWithFallback: jest
          .fn()
          .mockImplementation((fn, fallback) => Promise.resolve(fallback)),
        evaluatePlan: jest
          .fn()
          .mockResolvedValue({ passed: true, scores: {}, confidence: 1 }),
        evaluateRetrieval: jest
          .fn()
          .mockResolvedValue({ passed: true, scores: {}, confidence: 1 }),
        evaluateAnswer: jest
          .fn()
          .mockResolvedValue({ passed: true, scores: {}, confidence: 1 }),
        getRecords: jest.fn().mockResolvedValue({ records: [], total: 0 }),
        getRecordById: jest.fn().mockResolvedValue(null),
        getStats: jest.fn().mockResolvedValue({
          totalRecords: 0,
          passedCount: 0,
          failedCount: 0,
          passRate: 0,
        }),
        createEvaluationRecord: jest.fn().mockResolvedValue({ id: 'test-id' }),
        updateEvaluationRecord: jest.fn().mockResolvedValue(undefined),
        finalizeEvaluationRecord: jest.fn().mockResolvedValue(undefined),
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
    // Wait for background operations to complete before closing
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await app.close();
  });

  beforeEach(() => {
    // Reset mock call counters but keep implementations
    (ollamaService.chat as jest.Mock).mockClear();
    (ollamaService.generateResponse as jest.Mock).mockClear();
    (tavilyProvider.execute as jest.Mock).mockClear();
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
      // Mock Planning: create_plan, add_phase, add_step, finalize
      (ollamaService.chat as jest.Mock)
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Creating plan...',
            tool_calls: [
              {
                function: {
                  name: 'create_plan',
                  arguments: {
                    query: 'artificial intelligence',
                    name: 'AI Research Plan',
                  },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Adding search phase...',
            tool_calls: [
              {
                function: {
                  name: 'add_phase',
                  arguments: {
                    name: 'Search',
                    description: 'Search for AI information',
                    replanCheckpoint: false,
                  },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Adding step...',
            tool_calls: [
              {
                function: {
                  name: 'add_step',
                  arguments: {
                    phaseId: expect.any(String),
                    toolName: 'tavily_search',
                    type: 'tool_call',
                    config: { query: 'artificial intelligence basics' },
                  },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Adding synthesis phase...',
            tool_calls: [
              {
                function: {
                  name: 'add_phase',
                  arguments: {
                    name: 'Synthesis',
                    description: 'Synthesize final answer',
                    replanCheckpoint: false,
                  },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Adding synthesis step...',
            tool_calls: [
              {
                function: {
                  name: 'add_step',
                  arguments: {
                    phaseId: expect.any(String),
                    toolName: 'llm',
                    type: 'llm_call',
                    config: { prompt: 'Synthesize AI answer' },
                  },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Finalizing...',
            tool_calls: [
              { function: { name: 'finalize_plan', arguments: {} } },
            ],
          },
        })
        // Synthesis phase - LLM generates final answer
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Final synthesized answer based on research',
            tool_calls: [],
          },
        })
        // Default for any additional calls
        .mockResolvedValue({
          message: {
            role: 'assistant',
            content: 'Final synthesized answer based on research',
            tool_calls: [],
          },
        });

      // Mock Tavily search results - returns array directly
      (tavilyProvider.execute as jest.Mock).mockResolvedValue([
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

      // Start research and get logId
      const startResponse = await request(app.getHttpServer())
        .post('/api/research/query')
        .send({
          query: 'What is artificial intelligence?',
          maxSources: 5,
          searchDepth: 'comprehensive',
        })
        .expect(201);

      // Validate we got a logId
      expect(startResponse.body).toHaveProperty('logId');
      const logId = startResponse.body.logId;

      // Wait for research to complete (background processing)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Retrieve the result
      const resultResponse = await request(app.getHttpServer())
        .get(`/api/research/results/${logId}`)
        .expect(200);

      // Validate response structure
      expect(resultResponse.body).toHaveProperty('answer');
      expect(resultResponse.body).toHaveProperty('sources');

      // Validate answer
      expect(resultResponse.body.answer).toBe(
        'Final synthesized answer based on research',
      );

      // Validate sources
      expect(Array.isArray(resultResponse.body.sources)).toBe(true);
      expect(resultResponse.body.sources.length).toBeGreaterThan(0);
      expect(resultResponse.body.sources[0]).toHaveProperty('url');
      expect(resultResponse.body.sources[0]).toHaveProperty('title');
    });

    it('should handle default values for optional parameters', async () => {
      // Mock planning and execution
      (ollamaService.chat as jest.Mock)
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Creating plan...',
            tool_calls: [
              {
                function: {
                  name: 'create_plan',
                  arguments: { query: 'test query', name: 'Test Plan' },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Adding search phase...',
            tool_calls: [
              {
                function: {
                  name: 'add_phase',
                  arguments: {
                    name: 'Search',
                    description: 'Search phase',
                    replanCheckpoint: false,
                  },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Adding step...',
            tool_calls: [
              {
                function: {
                  name: 'add_step',
                  arguments: {
                    phaseId: expect.any(String),
                    toolName: 'tavily_search',
                    type: 'tool_call',
                    config: { query: 'test query' },
                  },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Adding synthesis phase...',
            tool_calls: [
              {
                function: {
                  name: 'add_phase',
                  arguments: {
                    name: 'Synthesis',
                    description: 'Synthesize answer',
                    replanCheckpoint: false,
                  },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Adding synthesis step...',
            tool_calls: [
              {
                function: {
                  name: 'add_step',
                  arguments: {
                    phaseId: expect.any(String),
                    toolName: 'llm',
                    type: 'llm_call',
                    config: { prompt: 'Synthesize answer' },
                  },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Finalizing...',
            tool_calls: [
              { function: { name: 'finalize_plan', arguments: {} } },
            ],
          },
        })
        // Synthesis phase - LLM generates final answer
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: 'Final answer',
            tool_calls: [],
          },
        })
        // Default for any additional calls
        .mockResolvedValue({
          message: {
            role: 'assistant',
            content: 'Final answer',
            tool_calls: [],
          },
        });

      // Start research and get logId
      const startResponse = await request(app.getHttpServer())
        .post('/api/research/query')
        .send({ query: 'test query' })
        .expect(201);

      // Validate we got a logId
      expect(startResponse.body).toHaveProperty('logId');
      const logId = startResponse.body.logId;

      // Wait for research to complete (background processing)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Retrieve the result
      const resultResponse = await request(app.getHttpServer())
        .get(`/api/research/results/${logId}`)
        .expect(200);

      expect(resultResponse.body).toHaveProperty('answer');
      expect(resultResponse.body.answer).toBe('Final answer');
    });
  });
});
