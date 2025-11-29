import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Orchestrator } from './orchestrator.service';
import { PlannerService } from './planner.service';
import { ExecutorRegistry } from '../executors/executor-registry.service';
import { LogService } from '../logging/log.service';
import { EventCoordinatorService } from './services/event-coordinator.service';
import { MilestoneService } from './services/milestone.service';
import { ResultExtractorService } from './services/result-extractor.service';
import { StepConfigurationService } from './services/step-configuration.service';
import { Plan } from './interfaces/plan.interface';
import { PlanEvaluationOrchestratorService } from '../evaluation/services/plan-evaluation-orchestrator.service';
import { EvaluationService } from '../evaluation/services/evaluation.service';
import { RetrievalEvaluatorService } from '../evaluation/services/retrieval-evaluator.service';
import { AnswerEvaluatorService } from '../evaluation/services/answer-evaluator.service';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let mockPlannerService: jest.Mocked<PlannerService>;
  let mockExecutorRegistry: jest.Mocked<ExecutorRegistry>;
  let mockLogService: jest.Mocked<LogService>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;
  let mockEventCoordinator: jest.Mocked<EventCoordinatorService>;
  let mockMilestoneService: jest.Mocked<MilestoneService>;
  let mockResultExtractor: jest.Mocked<ResultExtractorService>;
  let mockStepConfiguration: jest.Mocked<StepConfigurationService>;
  let mockPlanEvaluationOrchestrator: jest.Mocked<any>;
  let mockEvaluationService: jest.Mocked<any>;
  let mockRetrievalEvaluator: jest.Mocked<any>;
  let mockAnswerEvaluator: jest.Mocked<any>;

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
    } as unknown as jest.Mocked<PlannerService>;

    const mockExecutor = {
      execute: jest.fn().mockResolvedValue({ output: { results: ['test'] } }),
    };

    mockExecutorRegistry = {
      getExecutor: jest.fn().mockReturnValue(mockExecutor),
    } as unknown as jest.Mocked<ExecutorRegistry>;

    mockLogService = {
      append: jest.fn().mockResolvedValue({ id: 'log-1' }),
    } as unknown as jest.Mocked<LogService>;

    mockEventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    mockEventCoordinator = {
      emit: jest.fn().mockResolvedValue(undefined),
      emitPhaseStarted: jest.fn().mockResolvedValue(undefined),
      emitPhaseCompleted: jest.fn().mockResolvedValue(undefined),
      emitPhaseFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventCoordinatorService>;

    mockMilestoneService = {
      emitMilestonesForPhase: jest.fn().mockResolvedValue(undefined),
      emitPhaseCompletion: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MilestoneService>;

    mockResultExtractor = {
      extractSources: jest.fn().mockReturnValue([]),
      extractFinalOutput: jest.fn().mockReturnValue(''),
      collectRetrievalContent: jest.fn().mockReturnValue([]),
      extractSearchQueries: jest.fn().mockReturnValue([]),
      extractAllResults: jest.fn().mockReturnValue({ sources: [], output: '' }),
    } as unknown as jest.Mocked<ResultExtractorService>;

    mockStepConfiguration = {
      getDefaultConfig: jest.fn().mockReturnValue({}),
      enrichSynthesizeStep: jest.fn(),
    } as unknown as jest.Mocked<StepConfigurationService>;

    mockPlanEvaluationOrchestrator = {
      evaluatePlan: jest.fn().mockResolvedValue({
        passed: true,
        scores: { intentAlignment: 0.9, queryCoverage: 0.85 },
        confidence: 0.87,
        totalIterations: 1,
        escalatedToLargeModel: false,
        evaluationSkipped: false,
        attempts: [],
      }),
    };

    mockEvaluationService = {
      saveEvaluationRecord: jest.fn().mockResolvedValue(undefined),
      updateEvaluationRecord: jest.fn().mockResolvedValue(undefined),
    };

    mockRetrievalEvaluator = {
      evaluate: jest.fn().mockResolvedValue({
        passed: true,
        scores: { sourceQuality: 0.9, contentRelevance: 0.85 },
        confidence: 0.87,
        flaggedSevere: false,
        evaluationSkipped: false,
      }),
    };

    mockAnswerEvaluator = {
      evaluate: jest.fn().mockResolvedValue({
        passed: true,
        scores: { answerAccuracy: 0.9, answerCompleteness: 0.85 },
        confidence: 0.87,
        shouldRegenerate: false,
        evaluationSkipped: false,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Orchestrator,
        { provide: PlannerService, useValue: mockPlannerService },
        { provide: ExecutorRegistry, useValue: mockExecutorRegistry },
        { provide: LogService, useValue: mockLogService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: EventCoordinatorService, useValue: mockEventCoordinator },
        { provide: MilestoneService, useValue: mockMilestoneService },
        { provide: ResultExtractorService, useValue: mockResultExtractor },
        {
          provide: StepConfigurationService,
          useValue: mockStepConfiguration,
        },
        {
          provide: PlanEvaluationOrchestratorService,
          useValue: mockPlanEvaluationOrchestrator,
        },
        { provide: EvaluationService, useValue: mockEvaluationService },
        {
          provide: RetrievalEvaluatorService,
          useValue: mockRetrievalEvaluator,
        },
        { provide: AnswerEvaluatorService, useValue: mockAnswerEvaluator },
      ],
    }).compile();

    orchestrator = module.get<Orchestrator>(Orchestrator);
  });

  describe('executeResearch', () => {
    it('should create plan and execute all phases', async () => {
      const result = await orchestrator.executeResearch('test query');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPlannerService.createPlan).toHaveBeenCalledWith(
        'test query',
        expect.any(String),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockExecutorRegistry.getExecutor).toHaveBeenCalledWith(
        'tavily_search',
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
  });
});
