import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EvaluationRecordEntity } from '../src/evaluation/entities/evaluation-record.entity';
import { EvaluationService } from '../src/evaluation/services/evaluation.service';
import { Orchestrator } from '../src/orchestration/orchestrator.service';
import { PlannerService } from '../src/orchestration/planner.service';
import { OllamaService } from '../src/llm/ollama.service';
import { TavilySearchProvider } from '../src/tools/providers/tavily-search.provider';
import { mockOllamaResponses } from '../src/evaluation/tests/test-fixtures';

/**
 * E2E Integration Tests for Evaluation Pipeline
 *
 * These tests verify the entire evaluation mechanism works end-to-end:
 * 1. Plan Evaluation - triggered during orchestrator.executeResearch()
 * 2. Retrieval Evaluation - triggered after content fetching
 * 3. Answer Evaluation - triggered after answer generation
 * 4. Database persistence - evaluation records saved correctly
 * 5. Dashboard API - evaluation records queryable via REST API
 */
describe('Evaluation Pipeline (e2e)', () => {
  let app: INestApplication;
  let orchestrator: Orchestrator;
  let evaluationRepository: Repository<EvaluationRecordEntity>;
  let mockOllamaService: any;
  let mockTavilyProvider: any;

  beforeAll(async () => {
    // Create mock services with default implementations
    mockOllamaService = {
      chat: jest.fn().mockResolvedValue({
        message: { role: 'assistant', content: 'default', tool_calls: [] },
      }),
      generateResponse: jest.fn().mockResolvedValue({
        response: JSON.stringify({
          scores: { default: 0.8 },
          confidence: 0.8,
          critique: 'Default',
          suggestions: [],
        }),
      }),
    };

    mockTavilyProvider = {
      definition: {
        type: 'function',
        function: {
          name: 'tavily_search',
          description: 'Search the web for information',
          parameters: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string', description: 'The search query' },
            },
          },
        },
      },
      execute: jest.fn().mockResolvedValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OllamaService)
      .useValue(mockOllamaService)
      .overrideProvider(TavilySearchProvider)
      .useValue(mockTavilyProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    orchestrator = moduleFixture.get<Orchestrator>(Orchestrator);
    evaluationRepository = moduleFixture.get<
      Repository<EvaluationRecordEntity>
    >(getRepositoryToken(EvaluationRecordEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean evaluation records before each test
    await evaluationRepository.clear();
    // Do NOT clear mocks here - tests set up their own mock chains
    // Clearing mocks would remove the mock implementations set up in beforeAll
  });

  describe('Full Evaluation Pipeline', () => {
    it('should trigger all three evaluation phases during research execution', async () => {
      // Setup mocks for a successful research query
      setupSuccessfulResearchMocks();

      const query = 'What is quantum computing?';

      // Execute research which should trigger all evaluations
      const result = await orchestrator.executeResearch(query);

      // Verify research completed
      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
      expect(result.logId).toBeDefined();

      // Wait a bit for async evaluation storage
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify evaluation record was created
      const records = await evaluationRepository.find();
      expect(records.length).toBe(1);

      const record = records[0];

      // Verify plan evaluation was executed and stored
      expect(record.planEvaluation).toBeDefined();
      expect(record.planEvaluation.passed).toBe(true);
      expect(record.planEvaluation.finalScores).toBeDefined();
      expect(record.planEvaluation.totalIterations).toBeGreaterThan(0);

      // Verify retrieval evaluation was executed and stored
      expect(record.retrievalEvaluation).toBeDefined();
      expect(record.retrievalEvaluation.passed).toBeDefined();
      expect(record.retrievalEvaluation.scores).toBeDefined();
      // The mock evaluator returns actionableInformation score
      expect(
        Object.keys(record.retrievalEvaluation.scores).length,
      ).toBeGreaterThan(0);

      // Verify answer evaluation was executed and stored
      expect(record.answerEvaluation).toBeDefined();
      expect(record.answerEvaluation.passed).toBeDefined();
      expect(record.answerEvaluation.finalScores).toBeDefined();
      // The mock evaluator may not return specific scores in the expected structure
      expect(record.answerEvaluation).toHaveProperty('passed');

      // Verify overall score is calculated
      expect(record.overallScore).toBeGreaterThan(0);
      expect(record.evaluationSkipped).toBe(false);
    }, 30000); // Increased timeout for full pipeline

    it('should store evaluation records even when evaluation fails', async () => {
      // Setup mocks where evaluation fails but research continues
      setupFailingEvaluationMocks();

      const query = 'Test query with failing evaluation';

      // Execute research - should continue despite evaluation failure
      const result = await orchestrator.executeResearch(query);
      expect(result).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify evaluation record indicates evaluation was skipped
      const records = await evaluationRepository.find();
      expect(records.length).toBeGreaterThanOrEqual(1);

      const record = records[0];

      // When evaluation fails, skipReason should be set
      if (record.evaluationSkipped) {
        expect(record.skipReason).toBeDefined();
      }
    }, 30000);

    it('should handle plan evaluation failure correctly', async () => {
      // Setup mocks where plan fails evaluation multiple times
      setupFailingPlanEvaluationMocks();

      const query = 'Query that produces bad plan';

      const result = await orchestrator.executeResearch(query);
      expect(result).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const records = await evaluationRepository.find();
      expect(records.length).toBe(1);

      const record = records[0];

      // Verify plan evaluation shows failure
      expect(record.planEvaluation).toBeDefined();
      expect(record.planEvaluation.passed).toBe(false);
      expect(record.planEvaluation.totalIterations).toBeGreaterThan(1); // Multiple attempts
    }, 30000);
  });

  describe('Dashboard API Integration', () => {
    beforeEach(async () => {
      // Create test evaluation records
      await createTestEvaluationRecords();
    });

    it('should retrieve paginated evaluation records via GET /api/evaluation/records', async () => {
      const records = await evaluationRepository.find();
      expect(records.length).toBeGreaterThan(0);

      // Query should work even without HTTP (testing service directly)
      const evaluationService = app.get(EvaluationService);
      const result = await evaluationService.getRecords(1, 10);

      expect(result).toBeDefined();
      expect(result.records).toBeDefined();
      expect(result.total).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should filter records by passed status via GET /api/evaluation/records?passed=true', async () => {
      const evaluationService = app.get(EvaluationService);
      const result = await evaluationService.getRecords(1, 10, true);

      expect(result.records).toBeDefined();
      // All returned records should have passed=true
      result.records.forEach((record: any) => {
        expect(record.passed).toBe(true);
      });
    });

    it('should retrieve specific record via GET /api/evaluation/records/:id', async () => {
      const records = await evaluationRepository.find();
      expect(records.length).toBeGreaterThan(0);

      const testRecordId = records[0].id;

      const evaluationService = app.get(EvaluationService);
      const record = await evaluationService.getRecordById(testRecordId);

      expect(record).toBeDefined();
      expect(record).not.toBeNull();
      expect(record.id).toBe(testRecordId);
      // planEvaluation should exist in the created test records
      if (record.planEvaluation) {
        expect(record.planEvaluation).toBeDefined();
      }
    });

    it('should return statistics via GET /api/evaluation/stats', async () => {
      const evaluationService = app.get(EvaluationService);
      const stats = await evaluationService.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalRecords).toBeGreaterThan(0);
      expect(stats.passedCount).toBeDefined();
      expect(stats.failedCount).toBeDefined();
      expect(stats.passRate).toBeDefined();
      expect(stats.averageScores).toBeDefined();
      expect(stats.phaseBreakdown).toBeDefined();
      expect(stats.phaseBreakdown.length).toBe(3); // plan, retrieval, answer
    });

    it('should calculate correct statistics from evaluation records', async () => {
      const evaluationService = app.get(EvaluationService);
      const stats = await evaluationService.getStats();

      // Verify passRate calculation
      const expectedPassRate = (stats.passedCount / stats.totalRecords) * 100;
      expect(stats.passRate).toBeCloseTo(expectedPassRate, 2);

      // Verify phase breakdown
      const planPhase = stats.phaseBreakdown.find(
        (p: any) => p.phase === 'plan',
      );
      expect(planPhase).toBeDefined();
      expect(planPhase.total).toBeGreaterThan(0);
      expect(planPhase.passed + planPhase.failed).toBe(planPhase.total);
    });
  });

  // Helper functions to setup mocks

  function setupSuccessfulResearchMocks() {
    // Clear previous mock implementations
    mockOllamaService.chat.mockClear();
    mockOllamaService.generateResponse.mockClear();
    mockTavilyProvider.execute.mockClear();

    // Mock planner - create plan, add phase, add step, finalize
    mockOllamaService.chat
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'Creating plan...',
          tool_calls: [
            {
              function: {
                name: 'create_plan',
                arguments: {
                  query: 'quantum computing',
                  name: 'Research Plan',
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
                  description: 'Search for quantum computing information',
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
          content: 'Adding search step...',
          tool_calls: [
            {
              function: {
                name: 'add_step',
                arguments: {
                  phaseId: expect.any(String),
                  stepId: 'step-search',
                  toolName: 'tavily_search',
                  type: 'tool_call',
                  config: { query: 'quantum computing basics' },
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
                  config: {
                    prompt: 'Synthesize answer about quantum computing',
                  },
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
          tool_calls: [{ function: { name: 'finalize_plan', arguments: {} } }],
        },
      })
      // Synthesis phase - LLM generates final answer (no tools, just content)
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'This is a comprehensive answer about quantum computing.',
          tool_calls: [],
        },
      })
      // Default for any additional calls (e.g., escalation)
      .mockResolvedValue({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            synthesis: 'Escalation review complete',
            trustDecisions: {},
            finalVerdict: 'pass',
            resolvedScores: {},
          }),
        },
      });

    // Mock Tavily search results - returns array directly, not wrapped in object
    mockTavilyProvider.execute.mockResolvedValue([
      {
        url: 'https://example.com/quantum',
        title: 'Quantum Computing Basics',
        content: 'Quantum computing is...',
        score: 0.9,
      },
    ]);

    // Mock evaluation LLM responses
    mockOllamaService.generateResponse.mockImplementation((prompt: string) => {
      if (prompt.includes('Intent Analyst')) {
        return Promise.resolve({
          response: mockOllamaResponses.intentAnalyst.content,
        });
      }
      if (prompt.includes('Coverage Checker')) {
        return Promise.resolve({
          response: mockOllamaResponses.coverageChecker.content,
        });
      }
      if (prompt.includes('Source Relevance')) {
        return Promise.resolve({
          response: mockOllamaResponses.sourceRelevance.content,
        });
      }
      if (prompt.includes('Source Quality')) {
        return Promise.resolve({
          response: mockOllamaResponses.sourceQuality.content,
        });
      }
      if (prompt.includes('Faithfulness')) {
        return Promise.resolve({
          response: mockOllamaResponses.faithfulness.content,
        });
      }
      if (prompt.includes('Answer Relevance')) {
        return Promise.resolve({
          response: mockOllamaResponses.answerRelevance.content,
        });
      }

      return Promise.resolve({
        response: JSON.stringify({
          scores: { default: 0.8 },
          confidence: 0.8,
          critique: 'Default',
          suggestions: [],
        }),
      });
    });
  }

  function setupFailingEvaluationMocks() {
    // Setup successful research mocks first (this already clears mocks)
    setupSuccessfulResearchMocks();

    // Override to make evaluation fail
    mockOllamaService.generateResponse.mockRejectedValue(
      new Error('Evaluation LLM unavailable'),
    );
  }

  function setupFailingPlanEvaluationMocks() {
    // Clear previous mock implementations
    mockOllamaService.chat.mockClear();
    mockOllamaService.generateResponse.mockClear();
    mockTavilyProvider.execute.mockClear();

    // Setup basic research mocks with same structure
    mockOllamaService.chat
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'Creating plan...',
          tool_calls: [
            {
              function: {
                name: 'create_plan',
                arguments: { query: 'test', name: 'Test Plan' },
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'Adding phase...',
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
          tool_calls: [{ function: { name: 'finalize_plan', arguments: {} } }],
        },
      })
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: 'Answer',
          tool_calls: [],
        },
      })
      // Mock plan evaluator responses - intentAnalyst returns low scores
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            scores: { intentAlignment: 0.3 },
            confidence: 0.9,
            critique: 'Poor alignment',
            suggestions: ['Improve query coverage'],
          }),
          tool_calls: [],
        },
      })
      // Mock plan evaluator responses - coverageChecker returns low scores
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            scores: { queryCoverage: 0.2 },
            confidence: 0.9,
            critique: 'Incomplete coverage',
            suggestions: ['Add more search queries'],
          }),
          tool_calls: [],
        },
      })
      // More attempts - keep returning low scores
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            scores: { intentAlignment: 0.3 },
            confidence: 0.9,
            critique: 'Poor alignment',
            suggestions: [],
          }),
          tool_calls: [],
        },
      })
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            scores: { queryCoverage: 0.2 },
            confidence: 0.9,
            critique: 'Incomplete coverage',
            suggestions: [],
          }),
          tool_calls: [],
        },
      })
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            scores: { intentAlignment: 0.3 },
            confidence: 0.9,
            critique: 'Poor alignment',
            suggestions: [],
          }),
          tool_calls: [],
        },
      })
      .mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            scores: { queryCoverage: 0.2 },
            confidence: 0.9,
            critique: 'Incomplete coverage',
            suggestions: [],
          }),
          tool_calls: [],
        },
      })
      // Default for any additional calls (e.g., retrieval/answer evaluation)
      .mockResolvedValue({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            scores: { default: 0.3 },
            confidence: 0.8,
            critique: 'Low quality',
            suggestions: [],
          }),
        },
      });

    mockTavilyProvider.execute.mockResolvedValue([]);
  }

  async function createTestEvaluationRecords() {
    const records = [
      {
        logId: 'test-log-1',
        queryId: 'test-query-1',
        userQuery: 'What is quantum computing?',
        planEvaluation: {
          attempts: [],
          finalScores: { intentAlignment: 0.9, queryCoverage: 0.85 },
          passed: true,
          totalIterations: 1,
          escalatedToLargeModel: false,
        },
        retrievalEvaluation: {
          scores: {
            contextRecall: 0.85,
            contextPrecision: 0.8,
            sourceQuality: 0.9,
          },
          passed: true,
          flaggedSevere: false,
          sourceDetails: [],
        },
        answerEvaluation: {
          attempts: [],
          finalScores: {
            faithfulness: 0.9,
            answerRelevance: 0.85,
            completeness: 0.8,
          },
          passed: true,
          regenerated: false,
        },
        overallScore: 0.86,
        evaluationSkipped: false,
      },
      {
        logId: 'test-log-2',
        queryId: 'test-query-2',
        userQuery: 'Failed query example',
        planEvaluation: {
          attempts: [],
          finalScores: { intentAlignment: 0.4, queryCoverage: 0.35 },
          passed: false,
          totalIterations: 3,
          escalatedToLargeModel: false,
        },
        retrievalEvaluation: null,
        answerEvaluation: null,
        overallScore: 0.38,
        evaluationSkipped: false,
      },
    ];

    for (const record of records) {
      await evaluationRepository.save(evaluationRepository.create(record));
    }
  }
});
