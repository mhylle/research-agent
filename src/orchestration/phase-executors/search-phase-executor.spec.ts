import { Test, TestingModule } from '@nestjs/testing';
import { SearchPhaseExecutor } from './search-phase-executor';
import { EventCoordinatorService } from '../services/event-coordinator.service';
import { MilestoneService } from '../services/milestone.service';
import { ExecutorRegistry } from '../../executors/executor-registry.service';
import { StepConfigurationService } from '../services/step-configuration.service';
import { EvaluationCoordinatorService } from '../services/evaluation-coordinator.service';
import { Phase } from '../interfaces/phase.interface';
import { PhaseExecutionContext } from './interfaces/phase-execution-context';
import { PlanStep } from '../interfaces/plan-step.interface';

describe('SearchPhaseExecutor', () => {
  let executor: SearchPhaseExecutor;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;
  let executorRegistry: jest.Mocked<ExecutorRegistry>;
  let evaluationCoordinator: jest.Mocked<EvaluationCoordinatorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPhaseExecutor,
        {
          provide: EventCoordinatorService,
          useValue: {
            emit: jest.fn().mockResolvedValue(undefined),
            emitPhaseStarted: jest.fn().mockResolvedValue(undefined),
            emitPhaseCompleted: jest.fn().mockResolvedValue(undefined),
            emitPhaseFailed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MilestoneService,
          useValue: {
            emitMilestonesForPhase: jest.fn().mockResolvedValue(undefined),
            emitPhaseCompletion: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ExecutorRegistry,
          useValue: {
            getExecutor: jest.fn(),
          },
        },
        {
          provide: StepConfigurationService,
          useValue: {
            enrichSynthesizeStep: jest.fn(),
            getDefaultConfig: jest.fn().mockReturnValue({}),
          },
        },
        {
          provide: EvaluationCoordinatorService,
          useValue: {
            evaluateRetrieval: jest.fn().mockResolvedValue({
              passed: true,
              scores: { relevance: 0.9 },
            }),
          },
        },
      ],
    }).compile();

    executor = module.get<SearchPhaseExecutor>(SearchPhaseExecutor);
    eventCoordinator = module.get(EventCoordinatorService);
    executorRegistry = module.get(ExecutorRegistry);
    evaluationCoordinator = module.get(EvaluationCoordinatorService);
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
  });

  describe('canHandle', () => {
    it('should handle search phases', () => {
      expect(executor.canHandle(createMockPhase('search-phase'))).toBe(true);
      expect(executor.canHandle(createMockPhase('initial-search'))).toBe(true);
      expect(executor.canHandle(createMockPhase('query-execution'))).toBe(true);
    });

    it('should handle case-insensitive matching', () => {
      expect(executor.canHandle(createMockPhase('Search Phase'))).toBe(true);
      expect(executor.canHandle(createMockPhase('QUERY Data'))).toBe(true);
      expect(executor.canHandle(createMockPhase('Initial Setup'))).toBe(true);
    });

    it('should not handle non-search phases', () => {
      expect(executor.canHandle(createMockPhase('fetch-phase'))).toBe(false);
      expect(executor.canHandle(createMockPhase('synthesis-phase'))).toBe(
        false,
      );
      expect(executor.canHandle(createMockPhase('generic-phase'))).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute search phase successfully', async () => {
      const phase = createMockPhase('search-phase', [
        createMockStep('step1', 'search', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: ['result1', 'result2'],
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(eventCoordinator.emitPhaseStarted).toHaveBeenCalled();
      expect(eventCoordinator.emitPhaseCompleted).toHaveBeenCalled();
    });

    it('should trigger retrieval evaluation after successful execution with retrieved content', async () => {
      const phase = createMockPhase('search-phase', [
        createMockStep('step1', 'search', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: ['result1', 'result2'], // Array indicates retrieved content
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(evaluationCoordinator.evaluateRetrieval).toHaveBeenCalledWith(
        context.logId,
        context.plan.query,
        expect.arrayContaining([
          expect.objectContaining({
            status: 'completed',
            output: ['result1', 'result2'],
          }),
        ]),
      );
    });

    it('should not trigger evaluation if no retrieved content', async () => {
      const phase = createMockPhase('search-phase', [
        createMockStep('step1', 'search', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: null, // No content
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(evaluationCoordinator.evaluateRetrieval).not.toHaveBeenCalled();
    });

    it('should not trigger evaluation if phase failed', async () => {
      const phase = createMockPhase('search-phase', [
        createMockStep('step1', 'search', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockRejectedValue(new Error('Search failed')),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('failed');
      expect(evaluationCoordinator.evaluateRetrieval).not.toHaveBeenCalled();
    });

    it('should handle evaluation errors gracefully', async () => {
      const phase = createMockPhase('search-phase', [
        createMockStep('step1', 'search', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: ['result1'],
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      // Mock evaluation failure
      evaluationCoordinator.evaluateRetrieval.mockRejectedValue(
        new Error('Evaluation failed'),
      );

      // Should not throw - evaluation failure shouldn't break execution
      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(evaluationCoordinator.evaluateRetrieval).toHaveBeenCalled();
    });

    it('should include previous results in evaluation context', async () => {
      const phase = createMockPhase('search-phase', [
        createMockStep('step1', 'search', []),
      ]);
      const context = createMockContext();
      context.allPreviousResults = [
        {
          status: 'completed',
          stepId: 'prev-step',
          output: ['previous data'],
          toolName: 'search',
        },
      ];

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: ['new result'],
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      await executor.execute(phase, context);

      // Should pass all results (previous + new) to evaluation
      expect(evaluationCoordinator.evaluateRetrieval).toHaveBeenCalledWith(
        context.logId,
        context.plan.query,
        expect.arrayContaining([
          expect.objectContaining({ stepId: 'prev-step' }),
          expect.objectContaining({ output: ['new result'] }),
        ]),
      );
    });
  });
});

// Helper functions
function createMockPhase(name: string, steps: PlanStep[] = []): Phase {
  return {
    id: 'phase1',
    planId: 'plan1',
    name,
    description: 'Test phase',
    status: 'pending',
    steps,
    replanCheckpoint: false,
    order: 1,
  };
}

function createMockStep(
  id: string,
  toolName: string,
  dependencies: string[],
): PlanStep {
  return {
    id,
    phaseId: 'phase1',
    toolName,
    type: 'action',
    config: { query: 'test' },
    dependencies,
    status: 'pending',
    order: 1,
  };
}

function createMockContext(): PhaseExecutionContext {
  return {
    logId: 'log1',
    plan: {
      id: 'plan1',
      query: 'test query',
      status: 'executing',
      phases: [],
      createdAt: new Date(),
    },
    allPreviousResults: [],
  };
}
