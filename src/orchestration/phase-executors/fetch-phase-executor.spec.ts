import { Test, TestingModule } from '@nestjs/testing';
import { FetchPhaseExecutor } from './fetch-phase-executor';
import { EventCoordinatorService } from '../services/event-coordinator.service';
import { MilestoneService } from '../services/milestone.service';
import { ExecutorRegistry } from '../../executors/executor-registry.service';
import { StepConfigurationService } from '../services/step-configuration.service';
import { EvaluationCoordinatorService } from '../services/evaluation-coordinator.service';
import { Phase } from '../interfaces/phase.interface';
import { PhaseExecutionContext } from './interfaces/phase-execution-context';
import { PlanStep } from '../interfaces/plan-step.interface';

describe('FetchPhaseExecutor', () => {
  let executor: FetchPhaseExecutor;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;
  let executorRegistry: jest.Mocked<ExecutorRegistry>;
  let evaluationCoordinator: jest.Mocked<EvaluationCoordinatorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FetchPhaseExecutor,
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

    executor = module.get<FetchPhaseExecutor>(FetchPhaseExecutor);
    eventCoordinator = module.get(EventCoordinatorService);
    executorRegistry = module.get(ExecutorRegistry);
    evaluationCoordinator = module.get(EvaluationCoordinatorService);
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
  });

  describe('canHandle', () => {
    it('should handle fetch phases', () => {
      expect(executor.canHandle(createMockPhase('fetch-phase'))).toBe(true);
      expect(executor.canHandle(createMockPhase('gather-data'))).toBe(true);
      expect(executor.canHandle(createMockPhase('content-retrieval'))).toBe(
        true,
      );
    });

    it('should handle case-insensitive matching', () => {
      expect(executor.canHandle(createMockPhase('Fetch Phase'))).toBe(true);
      expect(executor.canHandle(createMockPhase('GATHER Data'))).toBe(true);
      expect(executor.canHandle(createMockPhase('Content Processing'))).toBe(
        true,
      );
    });

    it('should not handle non-fetch phases', () => {
      expect(executor.canHandle(createMockPhase('search-phase'))).toBe(false);
      expect(executor.canHandle(createMockPhase('synthesis-phase'))).toBe(
        false,
      );
      expect(executor.canHandle(createMockPhase('generic-phase'))).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute fetch phase successfully', async () => {
      const phase = createMockPhase('fetch-phase', [
        createMockStep('step1', 'fetch', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: ['fetched content 1', 'fetched content 2'],
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(eventCoordinator.emitPhaseStarted).toHaveBeenCalled();
      expect(eventCoordinator.emitPhaseCompleted).toHaveBeenCalled();
    });

    it('should trigger retrieval evaluation after successful execution', async () => {
      const phase = createMockPhase('fetch-phase', [
        createMockStep('step1', 'fetch', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: ['fetched content'],
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
            output: ['fetched content'],
          }),
        ]),
      );
    });

    it('should not trigger evaluation if no content retrieved', async () => {
      const phase = createMockPhase('fetch-phase', [
        createMockStep('step1', 'fetch', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: [],
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(evaluationCoordinator.evaluateRetrieval).not.toHaveBeenCalled();
    });

    it('should not trigger evaluation if phase failed', async () => {
      const phase = createMockPhase('fetch-phase', [
        createMockStep('step1', 'fetch', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockRejectedValue(new Error('Fetch failed')),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('failed');
      expect(evaluationCoordinator.evaluateRetrieval).not.toHaveBeenCalled();
    });

    it('should handle evaluation errors gracefully', async () => {
      const phase = createMockPhase('gather-phase', [
        createMockStep('step1', 'gather', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: ['gathered content'],
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      evaluationCoordinator.evaluateRetrieval.mockRejectedValue(
        new Error('Evaluation service unavailable'),
      );

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(evaluationCoordinator.evaluateRetrieval).toHaveBeenCalled();
    });

    it('should combine previous and current results for evaluation', async () => {
      const phase = createMockPhase('content-phase', [
        createMockStep('step1', 'fetch', []),
      ]);
      const context = createMockContext();
      context.allPreviousResults = [
        {
          status: 'completed',
          stepId: 'search-step',
          output: ['search result'],
          toolName: 'search',
        },
      ];

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: ['fetched content'],
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      await executor.execute(phase, context);

      expect(evaluationCoordinator.evaluateRetrieval).toHaveBeenCalledWith(
        context.logId,
        context.plan.query,
        expect.arrayContaining([
          expect.objectContaining({ stepId: 'search-step' }),
          expect.objectContaining({ output: ['fetched content'] }),
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
