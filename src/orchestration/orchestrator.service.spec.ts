import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Orchestrator } from './orchestrator.service';
import { PlannerService } from './planner.service';
import { LogService } from '../logging/log.service';
import { EventCoordinatorService } from './services/event-coordinator.service';
import { ResultExtractorService } from './services/result-extractor.service';
import { EvaluationCoordinatorService } from './services/evaluation-coordinator.service';
import { PhaseExecutorRegistry } from './phase-executors/phase-executor-registry';
import { WorkingMemoryService } from './services/working-memory.service';
import { QueryDecomposerService } from './services/query-decomposer.service';
import { CoverageAnalyzerService } from './services/coverage-analyzer.service';
import { OllamaService } from '../llm/ollama.service';
import { ReflectionService } from '../reflection/services/reflection.service';
import { Plan } from './interfaces/plan.interface';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let mockPlannerService: jest.Mocked<PlannerService>;
  let mockLogService: jest.Mocked<LogService>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;
  let mockEventCoordinator: jest.Mocked<EventCoordinatorService>;
  let mockResultExtractor: jest.Mocked<ResultExtractorService>;
  let mockEvaluationCoordinator: jest.Mocked<any>;
  let mockPhaseExecutorRegistry: jest.Mocked<PhaseExecutorRegistry>;
  let mockWorkingMemory: jest.Mocked<WorkingMemoryService>;
  let mockQueryDecomposer: jest.Mocked<QueryDecomposerService>;
  let mockCoverageAnalyzer: jest.Mocked<CoverageAnalyzerService>;
  let mockLlmService: jest.Mocked<OllamaService>;
  let mockReflectionService: jest.Mocked<ReflectionService>;

  const mockPlan: Plan = {
    id: 'plan-1',
    query: 'test query',
    status: 'executing',
    phases: [
      {
        id: 'phase-1',
        planId: 'plan-1',
        name: 'search',
        status: 'pending',
        steps: [
          {
            id: 'step-1',
            phaseId: 'phase-1',
            type: 'tool_call',
            toolName: 'tavily_search',
            config: { query: 'test' },
            dependencies: [],
            status: 'pending',
            order: 0,
          },
        ],
        replanCheckpoint: false,
        order: 0,
      },
    ],
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockPlannerService = {
      createPlan: jest.fn().mockResolvedValue(mockPlan),
      replan: jest.fn().mockResolvedValue({ modified: false, plan: mockPlan }),
      decideRecovery: jest
        .fn()
        .mockResolvedValue({ action: 'skip', reason: 'test' }),
      setPhaseResults: jest.fn(),
      regeneratePlanWithFeedback: jest.fn().mockResolvedValue(mockPlan),
    } as unknown as jest.Mocked<PlannerService>;

    mockLogService = {
      append: jest.fn().mockResolvedValue({ id: 'log-1' }),
    } as unknown as jest.Mocked<LogService>;

    mockEventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    mockEventCoordinator = {
      emit: jest.fn().mockResolvedValue(undefined),
      emitPhaseStarted: jest.fn().mockResolvedValue(undefined),
      emitPhaseCompleted: jest.fn().mockResolvedValue(undefined),
      emitPhaseFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventCoordinatorService>;

    mockResultExtractor = {
      extractSources: jest.fn().mockReturnValue([]),
      extractFinalOutput: jest.fn().mockReturnValue(''),
      collectRetrievalContent: jest.fn().mockReturnValue([]),
      extractSearchQueries: jest.fn().mockReturnValue([]),
      extractAllResults: jest.fn().mockReturnValue({ sources: [], output: '' }),
    } as unknown as jest.Mocked<ResultExtractorService>;

    mockEvaluationCoordinator = {
      evaluatePlan: jest.fn().mockResolvedValue({
        passed: true,
        scores: { intentAlignment: 0.9, queryCoverage: 0.85 },
        confidence: 0.87,
        totalIterations: 1,
        escalatedToLargeModel: false,
        evaluationSkipped: false,
        attempts: [],
      }),
      evaluateRetrieval: jest.fn().mockResolvedValue({
        passed: true,
        scores: { sourceQuality: 0.9, contentRelevance: 0.85 },
        confidence: 0.87,
        flaggedSevere: false,
        evaluationSkipped: false,
      }),
      evaluateAnswer: jest.fn().mockResolvedValue({
        passed: true,
        scores: { answerAccuracy: 0.9, answerCompleteness: 0.85 },
        confidence: 0.87,
        shouldRegenerate: false,
        evaluationSkipped: false,
      }),
    };

    mockWorkingMemory = {
      initialize: jest.fn().mockReturnValue({}),
      cleanup: jest.fn(),
      setScratchPadValue: jest.fn(),
      getScratchPadValue: jest.fn(),
      addSubGoal: jest.fn(),
      addGatheredInfo: jest.fn(),
      addGap: jest.fn(),
      updatePhase: jest.fn(),
    } as unknown as jest.Mocked<WorkingMemoryService>;

    mockQueryDecomposer = {
      decomposeQuery: jest.fn().mockResolvedValue({
        originalQuery: 'test query',
        isComplex: false,
        subQueries: [],
        executionPlan: [],
        reasoning: 'Simple query, no decomposition needed',
      }),
    } as unknown as jest.Mocked<QueryDecomposerService>;

    mockCoverageAnalyzer = {
      analyzeCoverage: jest.fn().mockResolvedValue({
        overallCoverage: 0.9,
        aspectsCovered: [
          {
            id: 'a1',
            description: 'Test aspect',
            answered: true,
            confidence: 0.9,
            keywords: [],
            supportingSources: [],
          },
        ],
        aspectsMissing: [],
        suggestedRetrievals: [],
        isComplete: true,
      }),
    } as unknown as jest.Mocked<CoverageAnalyzerService>;

    mockLlmService = {
      chat: jest.fn().mockResolvedValue({
        message: { content: 'Test response' },
      }),
    } as unknown as jest.Mocked<OllamaService>;

    mockReflectionService = {
      reflect: jest.fn().mockResolvedValue({
        iterationCount: 2,
        improvements: [0.1, 0.05],
        identifiedGaps: [],
        finalAnswer: 'Refined answer through reflection',
        finalConfidence: 0.9,
        reflectionTrace: [
          {
            iteration: 1,
            critique: 'Initial critique',
            gapsFound: [],
            confidenceBefore: 0,
            confidenceAfter: 0.85,
            improvement: 0.1,
          },
          {
            iteration: 2,
            critique: 'Second iteration critique',
            gapsFound: [],
            confidenceBefore: 0.85,
            confidenceAfter: 0.9,
            improvement: 0.05,
          },
        ],
      }),
    } as unknown as jest.Mocked<ReflectionService>;

    // Mock phase executor that returns successful results
    const mockPhaseExecutor = {
      canHandle: jest.fn().mockReturnValue(true),
      execute: jest.fn().mockResolvedValue({
        status: 'completed',
        stepResults: [
          {
            status: 'completed',
            stepId: 'step-1',
            output: { results: ['test'] },
            input: { query: 'test' },
            toolName: 'tavily_search',
          },
        ],
      }),
    };

    mockPhaseExecutorRegistry = {
      getExecutor: jest.fn().mockReturnValue(mockPhaseExecutor),
    } as unknown as jest.Mocked<PhaseExecutorRegistry>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Orchestrator,
        { provide: PlannerService, useValue: mockPlannerService },
        { provide: LogService, useValue: mockLogService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EventCoordinatorService, useValue: mockEventCoordinator },
        { provide: ResultExtractorService, useValue: mockResultExtractor },
        {
          provide: EvaluationCoordinatorService,
          useValue: mockEvaluationCoordinator,
        },
        {
          provide: PhaseExecutorRegistry,
          useValue: mockPhaseExecutorRegistry,
        },
        { provide: WorkingMemoryService, useValue: mockWorkingMemory },
        { provide: QueryDecomposerService, useValue: mockQueryDecomposer },
        { provide: CoverageAnalyzerService, useValue: mockCoverageAnalyzer },
        { provide: OllamaService, useValue: mockLlmService },
        { provide: ReflectionService, useValue: mockReflectionService },
      ],
    }).compile();

    orchestrator = module.get<Orchestrator>(Orchestrator);
  });

  describe('executeResearch', () => {
    it('should create plan and execute all phases for simple query', async () => {
      const result = await orchestrator.executeResearch('test query');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockQueryDecomposer.decomposeQuery).toHaveBeenCalledWith(
        'test query',
        expect.any(String),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPlannerService.createPlan).toHaveBeenCalledWith(
        'test query',
        expect.any(String),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPhaseExecutorRegistry.getExecutor).toHaveBeenCalledWith(
        mockPlan.phases[0],
      );
      expect(result).toBeDefined();
      expect(result.logId).toBeDefined();
    });

    it('should emit session events', async () => {
      await orchestrator.executeResearch('test query');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        expect.any(String),
        'session_started',
        expect.objectContaining({ query: 'test query' }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        expect.any(String),
        'session_completed',
        expect.any(Object),
      );
    });

    it('should initialize and cleanup working memory', async () => {
      await orchestrator.executeResearch('test query');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockWorkingMemory.initialize).toHaveBeenCalledWith(
        expect.any(String),
        'test query',
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockWorkingMemory.cleanup).toHaveBeenCalledWith(expect.any(String));
    });

    it('should store decomposition in working memory', async () => {
      await orchestrator.executeResearch('test query');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockWorkingMemory.setScratchPadValue).toHaveBeenCalledWith(
        expect.any(String),
        'decomposition',
        expect.objectContaining({
          originalQuery: 'test query',
          isComplex: false,
        }),
      );
    });

    it('should execute decomposed query for complex queries', async () => {
      const complexDecomposition = {
        originalQuery: 'Compare AI and blockchain impacts',
        isComplex: true,
        subQueries: [
          {
            id: 'sq-1',
            text: 'What are AI impacts?',
            order: 1,
            dependencies: [],
            type: 'factual' as const,
            priority: 'high' as const,
            estimatedComplexity: 3,
          },
          {
            id: 'sq-2',
            text: 'What are blockchain impacts?',
            order: 2,
            dependencies: [],
            type: 'factual' as const,
            priority: 'high' as const,
            estimatedComplexity: 3,
          },
        ],
        executionPlan: [
          [
            {
              id: 'sq-1',
              text: 'What are AI impacts?',
              order: 1,
              dependencies: [],
              type: 'factual' as const,
              priority: 'high' as const,
              estimatedComplexity: 3,
            },
            {
              id: 'sq-2',
              text: 'What are blockchain impacts?',
              order: 2,
              dependencies: [],
              type: 'factual' as const,
              priority: 'high' as const,
              estimatedComplexity: 3,
            },
          ],
        ],
        reasoning: 'Complex comparison query',
      };

      mockQueryDecomposer.decomposeQuery.mockResolvedValue(complexDecomposition);

      const result = await orchestrator.executeResearch('Compare AI and blockchain impacts');

      expect(result).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        expect.any(String),
        'sub_query_execution_started',
        expect.objectContaining({
          subQueryId: 'sq-1',
        }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        expect.any(String),
        'final_synthesis_started',
        expect.any(Object),
      );
    });
  });

  describe('executeWithIterativeRetrieval', () => {
    it('should execute iterative retrieval with single cycle when coverage is complete', async () => {
      // Setup mock to return coverage when retrieved from working memory
      const completeCoverage = {
        overallCoverage: 0.9,
        aspectsCovered: [
          {
            id: 'a1',
            description: 'Test aspect',
            answered: true,
            confidence: 0.9,
            keywords: [],
            supportingSources: [],
          },
        ],
        aspectsMissing: [],
        suggestedRetrievals: [],
        isComplete: true,
      };

      mockWorkingMemory.getScratchPadValue.mockReturnValue(completeCoverage);

      // Coverage is complete on first check (default mock behavior)
      const result = await orchestrator.executeWithIterativeRetrieval('test query', 'log-123', 2);

      expect(result).toBeDefined();
      expect(result.logId).toBe('log-123');
      expect(result.planId).toBe('iterative-log-123');
      expect(result.metadata.retrievalCycles).toBe(1);
      expect(result.metadata.finalCoverage).toBe(0.9);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'session_started',
        expect.objectContaining({ query: 'test query', iterativeMode: true }),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'retrieval_cycle_started',
        expect.objectContaining({ cycle: 1, maxCycles: 2 }),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'coverage_checked',
        expect.objectContaining({
          cycle: 1,
          overallCoverage: 0.9,
          isComplete: true,
        }),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'retrieval_cycle_completed',
        expect.objectContaining({
          cycle: 1,
          terminationReason: 'coverage_threshold_met',
        }),
      );
    });

    it('should execute multiple retrieval cycles when coverage is incomplete', async () => {
      // First cycle: incomplete coverage with suggestions
      const incompleteCoverage = {
        overallCoverage: 0.6,
        aspectsCovered: [
          {
            id: 'a1',
            description: 'Partial aspect',
            answered: true,
            confidence: 0.6,
            keywords: [],
            supportingSources: [],
          },
        ],
        aspectsMissing: [
          {
            id: 'a2',
            description: 'Missing aspect',
            answered: false,
            confidence: 0,
            keywords: ['test', 'query'],
            supportingSources: [],
          },
        ],
        suggestedRetrievals: [
          {
            aspect: 'Missing aspect',
            searchQuery: 'test query missing aspect',
            priority: 'high' as const,
            reasoning: 'Need more info',
          },
        ],
        isComplete: false,
      };

      // Second cycle: complete coverage
      const completeCoverage = {
        overallCoverage: 0.9,
        aspectsCovered: [
          {
            id: 'a1',
            description: 'Complete aspect',
            answered: true,
            confidence: 0.9,
            keywords: [],
            supportingSources: [],
          },
        ],
        aspectsMissing: [],
        suggestedRetrievals: [],
        isComplete: true,
      };

      mockCoverageAnalyzer.analyzeCoverage
        .mockResolvedValueOnce(incompleteCoverage)
        .mockResolvedValueOnce(completeCoverage);

      // Mock getScratchPadValue to return coverage based on cycle
      mockWorkingMemory.getScratchPadValue.mockImplementation((logId, key) => {
        if (key === 'coverage_cycle_1') return incompleteCoverage;
        if (key === 'coverage_cycle_2') return completeCoverage;
        return undefined;
      });

      const result = await orchestrator.executeWithIterativeRetrieval('test query', 'log-123', 3);

      expect(result.metadata.retrievalCycles).toBe(2);
      expect(result.metadata.finalCoverage).toBe(0.9);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockCoverageAnalyzer.analyzeCoverage).toHaveBeenCalledTimes(2);
    });

    it('should terminate when max cycles reached', async () => {
      // Always return incomplete coverage
      mockCoverageAnalyzer.analyzeCoverage.mockResolvedValue({
        overallCoverage: 0.5,
        aspectsCovered: [],
        aspectsMissing: [
          {
            id: 'a1',
            description: 'Missing',
            answered: false,
            confidence: 0,
            keywords: [],
            supportingSources: [],
          },
        ],
        suggestedRetrievals: [
          {
            aspect: 'Missing',
            searchQuery: 'more info',
            priority: 'high' as const,
            reasoning: 'Need more',
          },
        ],
        isComplete: false,
      });

      const result = await orchestrator.executeWithIterativeRetrieval('test query', 'log-123', 2);

      expect(result.metadata.retrievalCycles).toBe(2);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'retrieval_cycle_completed',
        expect.objectContaining({
          cycle: 2,
          terminationReason: 'max_cycles_reached',
        }),
      );
    });

    it('should terminate when no more retrieval suggestions', async () => {
      // First cycle: incomplete but no suggestions
      mockCoverageAnalyzer.analyzeCoverage.mockResolvedValue({
        overallCoverage: 0.7,
        aspectsCovered: [],
        aspectsMissing: [],
        suggestedRetrievals: [],
        isComplete: false,
      });

      const result = await orchestrator.executeWithIterativeRetrieval('test query', 'log-123', 3);

      expect(result.metadata.retrievalCycles).toBe(1);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'retrieval_cycle_completed',
        expect.objectContaining({
          cycle: 1,
          terminationReason: 'no_more_suggestions',
        }),
      );
    });

    it('should emit correct SSE events during iterative retrieval', async () => {
      await orchestrator.executeWithIterativeRetrieval('test query', 'log-123', 2);

      // Check for all expected event types
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'session_started',
        expect.any(Object),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'retrieval_cycle_started',
        expect.any(Object),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'coverage_checked',
        expect.any(Object),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'retrieval_cycle_completed',
        expect.any(Object),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'log-123',
        'session_completed',
        expect.any(Object),
      );
    });

    it('should track coverage in working memory', async () => {
      await orchestrator.executeWithIterativeRetrieval('test query', 'log-123', 2);

      // Should store coverage for cycle 1
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockWorkingMemory.setScratchPadValue).toHaveBeenCalledWith(
        'log-123',
        'coverage_cycle_1',
        expect.objectContaining({
          overallCoverage: 0.9,
          isComplete: true,
        }),
      );

      // Should retrieve coverage when checking termination
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockWorkingMemory.getScratchPadValue).toHaveBeenCalledWith(
        'log-123',
        'coverage_cycle_1',
      );
    });
  });

  describe('orchestrateAgenticResearch', () => {
    it('should execute full agentic pipeline for simple query', async () => {
      const result = await orchestrator.orchestrateAgenticResearch('test query');

      expect(result).toBeDefined();
      expect(result.answer).toBe('Refined answer through reflection');
      expect(result.metadata.usedAgenticPipeline).toBe(true);
      expect(result.metadata.reflectionIterations).toBe(2);
      expect(result.metadata.totalImprovement).toBeCloseTo(0.15, 5);
      expect(result.reflection).toBeDefined();
      expect(result.reflection?.iterationCount).toBe(2);
      expect(result.reflection?.finalConfidence).toBe(0.9);
      expect(result.reflection?.improvements).toEqual([0.1, 0.05]);

      // Should use query decomposer
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockQueryDecomposer.decomposeQuery).toHaveBeenCalledWith(
        'test query',
        expect.any(String),
      );

      // Should call reflection service
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockReflectionService.reflect).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          maxIterations: 2,
          minImprovementThreshold: 0.05,
          qualityTargetThreshold: 0.85,
          timeoutPerIteration: 60000,
        }),
      );

      // Should emit agentic session events
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        expect.any(String),
        'session_started',
        expect.objectContaining({
          query: 'test query',
          agenticMode: true,
        }),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        expect.any(String),
        'session_completed',
        expect.objectContaining({
          agenticMode: true,
          decomposed: false,
          reflectionIterations: 2,
          finalConfidence: 0.9,
        }),
      );
    });

    it('should execute full agentic pipeline for complex query', async () => {
      // Configure decomposer to return complex query
      mockQueryDecomposer.decomposeQuery.mockResolvedValueOnce({
        originalQuery: 'complex test query',
        isComplex: true,
        subQueries: [
          {
            id: 'sq1',
            text: 'sub-query 1',
            type: 'factual',
            dependencies: [],
            priority: 1,
          },
          {
            id: 'sq2',
            text: 'sub-query 2',
            type: 'analytical',
            dependencies: ['sq1'],
            priority: 2,
          },
        ],
        executionPlan: [
          [
            {
              id: 'sq1',
              text: 'sub-query 1',
              type: 'factual',
              dependencies: [],
              priority: 1,
            },
          ],
          [
            {
              id: 'sq2',
              text: 'sub-query 2',
              type: 'analytical',
              dependencies: ['sq1'],
              priority: 2,
            },
          ],
        ],
        reasoning: 'Complex query requires decomposition',
      });

      const result = await orchestrator.orchestrateAgenticResearch('complex test query');

      expect(result).toBeDefined();
      expect(result.metadata.usedAgenticPipeline).toBe(true);
      expect(result.metadata.decomposition).toBeDefined();
      expect(result.metadata.decomposition?.isComplex).toBe(true);

      // Should emit sub-query events
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        expect.any(String),
        'sub_query_execution_started',
        expect.objectContaining({
          subQueryId: 'sq1',
          useIterativeRetrieval: true,
        }),
      );

      // Should call reflection service
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockReflectionService.reflect).toHaveBeenCalled();
    });

    it('should include reflection results in agentic response', async () => {
      const result = await orchestrator.orchestrateAgenticResearch('test query');

      expect(result.reflection).toBeDefined();
      expect(result.reflection?.iterationCount).toBe(2);
      expect(result.reflection?.finalConfidence).toBe(0.9);
      expect(result.reflection?.improvements).toEqual([0.1, 0.05]);
      expect(result.metadata.reflectionIterations).toBe(2);
      expect(result.metadata.totalImprovement).toBeCloseTo(0.15, 5);
    });

    it('should handle reflection errors gracefully', async () => {
      // Make reflection service throw an error
      mockReflectionService.reflect.mockRejectedValueOnce(
        new Error('Reflection failed'),
      );

      await expect(
        orchestrator.orchestrateAgenticResearch('test query'),
      ).rejects.toThrow('Reflection failed');

      // Should still clean up working memory
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockWorkingMemory.cleanup).toHaveBeenCalled();
    });
  });
});
