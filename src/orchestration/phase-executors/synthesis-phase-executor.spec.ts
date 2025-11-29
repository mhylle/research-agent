import { Test, TestingModule } from '@nestjs/testing';
import { SynthesisPhaseExecutor } from './synthesis-phase-executor';
import { EventCoordinatorService } from '../services/event-coordinator.service';
import { MilestoneService } from '../services/milestone.service';
import { ExecutorRegistry } from '../../executors/executor-registry.service';
import { StepConfigurationService } from '../services/step-configuration.service';
import { Phase } from '../interfaces/phase.interface';
import { PhaseExecutionContext } from './interfaces/phase-execution-context';
import { PlanStep } from '../interfaces/plan-step.interface';

describe('SynthesisPhaseExecutor', () => {
  let executor: SynthesisPhaseExecutor;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;
  let executorRegistry: jest.Mocked<ExecutorRegistry>;
  let stepConfiguration: jest.Mocked<StepConfigurationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SynthesisPhaseExecutor,
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
      ],
    }).compile();

    executor = module.get<SynthesisPhaseExecutor>(SynthesisPhaseExecutor);
    eventCoordinator = module.get(EventCoordinatorService);
    executorRegistry = module.get(ExecutorRegistry);
    stepConfiguration = module.get(StepConfigurationService);
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
  });

  describe('canHandle', () => {
    it('should handle synthesis phases', () => {
      expect(executor.canHandle(createMockPhase('synthesis-phase'))).toBe(
        true,
      );
      expect(executor.canHandle(createMockPhase('answer-generation'))).toBe(
        true,
      );
      expect(executor.canHandle(createMockPhase('generate-response'))).toBe(
        true,
      );
    });

    it('should handle case-insensitive matching', () => {
      expect(executor.canHandle(createMockPhase('Synthesis Phase'))).toBe(
        true,
      );
      expect(executor.canHandle(createMockPhase('ANSWER Generation'))).toBe(
        true,
      );
      expect(executor.canHandle(createMockPhase('Generate Report'))).toBe(
        true,
      );
    });

    it('should handle partial word matches', () => {
      expect(executor.canHandle(createMockPhase('synthesizing-data'))).toBe(
        true,
      );
      expect(executor.canHandle(createMockPhase('content-generation'))).toBe(
        true,
      );
      expect(executor.canHandle(createMockPhase('answer-phase'))).toBe(true);
    });

    it('should not handle non-synthesis phases', () => {
      expect(executor.canHandle(createMockPhase('search-phase'))).toBe(false);
      expect(executor.canHandle(createMockPhase('fetch-phase'))).toBe(false);
      expect(executor.canHandle(createMockPhase('generic-phase'))).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute synthesis phase successfully', async () => {
      const phase = createMockPhase('synthesis-phase', [
        createMockStep('step1', 'synthesize', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: 'synthesized answer',
          tokensUsed: 500,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(eventCoordinator.emitPhaseStarted).toHaveBeenCalled();
      expect(eventCoordinator.emitPhaseCompleted).toHaveBeenCalled();
    });

    it('should use default execute from base class', async () => {
      const phase = createMockPhase('answer-phase', [
        createMockStep('step1', 'synthesize', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: 'generated answer',
          tokensUsed: 500,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      // Should follow standard lifecycle from base class
      expect(result.status).toBe('completed');
      expect(result.stepResults).toHaveLength(1);
      expect(mockStepExecutor.execute).toHaveBeenCalled();
    });

    it('should handle synthesis step enrichment via base class', async () => {
      const phase = createMockPhase('synthesis-phase', [
        createMockStep('step1', 'synthesize', []),
      ]);
      const context = createMockContext();
      context.allPreviousResults = [
        {
          status: 'completed',
          stepId: 'search-step',
          output: ['search result 1', 'search result 2'],
          toolName: 'search',
        },
      ];

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: 'synthesized from search results',
          tokensUsed: 500,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      // Base class should enrich synthesize steps
      expect(stepConfiguration.enrichSynthesizeStep).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'synthesize' }),
        context.plan,
        expect.any(Array),
      );

      expect(result.status).toBe('completed');
    });

    it('should handle multiple synthesis steps', async () => {
      const phase = createMockPhase('generation-phase', [
        createMockStep('step1', 'synthesize', []),
        createMockStep('step2', 'synthesize', ['step1']),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({
            output: 'first synthesis',
            tokensUsed: 300,
          })
          .mockResolvedValueOnce({
            output: 'refined synthesis',
            tokensUsed: 200,
          }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(result.stepResults).toHaveLength(2);
      expect(stepConfiguration.enrichSynthesizeStep).toHaveBeenCalledTimes(2);
    });

    it('should handle phase failure correctly', async () => {
      const phase = createMockPhase('synthesis-phase', [
        createMockStep('step1', 'synthesize', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockRejectedValue(new Error('Synthesis failed')),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('failed');
      expect(eventCoordinator.emitPhaseFailed).toHaveBeenCalled();
    });

    it('should not add special behavior beyond base class', async () => {
      // SynthesisPhaseExecutor uses all default behavior from BasePhaseExecutor
      // Step enrichment is handled by base class executeStep method
      const phase = createMockPhase('synthesis-phase', [
        createMockStep('step1', 'synthesize', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: 'answer',
          tokensUsed: 500,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      // Just verify standard execution - no special synthesis-specific behavior
      expect(result.status).toBe('completed');
      expect(eventCoordinator.emitPhaseStarted).toHaveBeenCalledTimes(1);
      expect(eventCoordinator.emitPhaseCompleted).toHaveBeenCalledTimes(1);
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
