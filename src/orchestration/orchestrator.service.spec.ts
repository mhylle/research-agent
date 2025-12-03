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
import { OllamaService } from '../llm/ollama.service';
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
  let mockLlmService: jest.Mocked<OllamaService>;

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

    mockLlmService = {
      chat: jest.fn().mockResolvedValue({
        message: { content: 'Test response' },
      }),
    } as unknown as jest.Mocked<OllamaService>;

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
        { provide: OllamaService, useValue: mockLlmService },
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
});
