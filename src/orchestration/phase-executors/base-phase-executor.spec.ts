import { Test, TestingModule } from '@nestjs/testing';
import { BasePhaseExecutor } from './base-phase-executor';
import { EventCoordinatorService } from '../services/event-coordinator.service';
import { MilestoneService } from '../services/milestone.service';
import { ExecutorRegistry } from '../../executors/executor-registry.service';
import { StepConfigurationService } from '../services/step-configuration.service';
import { Phase, PhaseResult, StepResult } from '../interfaces/phase.interface';
import { PhaseExecutionContext } from './interfaces/phase-execution-context';
import { Plan } from '../interfaces/plan.interface';
import { PlanStep } from '../interfaces/plan-step.interface';

// Concrete implementation for testing
class TestPhaseExecutor extends BasePhaseExecutor {
  canHandle(phase: Phase): boolean {
    return phase.name.includes('test');
  }
}

describe('BasePhaseExecutor', () => {
  let executor: TestPhaseExecutor;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;
  let milestoneService: jest.Mocked<MilestoneService>;
  let executorRegistry: jest.Mocked<ExecutorRegistry>;
  let stepConfiguration: jest.Mocked<StepConfigurationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestPhaseExecutor,
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

    executor = module.get<TestPhaseExecutor>(TestPhaseExecutor);
    eventCoordinator = module.get(EventCoordinatorService);
    milestoneService = module.get(MilestoneService);
    executorRegistry = module.get(ExecutorRegistry);
    stepConfiguration = module.get(StepConfigurationService);
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
  });

  describe('canHandle', () => {
    it('should use subclass implementation', () => {
      const phase = createMockPhase('test-phase');
      expect(executor.canHandle(phase)).toBe(true);
    });

    it('should return false for non-matching phases', () => {
      const phase = createMockPhase('other-phase');
      expect(executor.canHandle(phase)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute phase lifecycle successfully', async () => {
      const phase = createMockPhase('test-phase', [
        createMockStep('step1', 'search', []),
      ]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: 'test result',
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      // Should emit phase started
      expect(eventCoordinator.emitPhaseStarted).toHaveBeenCalledWith(
        context.logId,
        phase,
      );

      // Should emit milestones
      expect(milestoneService.emitMilestonesForPhase).toHaveBeenCalledWith(
        phase,
        context.logId,
        context.plan.query,
      );

      // Should execute step
      expect(mockStepExecutor.execute).toHaveBeenCalled();

      // Should emit phase completed
      expect(eventCoordinator.emitPhaseCompleted).toHaveBeenCalledWith(
        context.logId,
        phase,
        1,
      );

      // Should emit phase completion milestone
      expect(milestoneService.emitPhaseCompletion).toHaveBeenCalledWith(
        phase,
        context.logId,
      );

      // Should return successful result
      expect(result.status).toBe('completed');
      expect(result.stepResults).toHaveLength(1);
      expect(phase.status).toBe('completed');
    });

    it('should handle step failure correctly', async () => {
      const step1 = createMockStep('step1', 'search', []);
      const phase = createMockPhase('test-phase', [step1]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockRejectedValue(new Error('Step failed')),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      // Should emit phase failed
      expect(eventCoordinator.emitPhaseFailed).toHaveBeenCalledWith(
        context.logId,
        phase,
        'step1',
        'Step failed',
      );

      // Should return failed result
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(phase.status).toBe('failed');
    });

    it('should execute steps in parallel when no dependencies', async () => {
      const step1 = createMockStep('step1', 'search', []);
      const step2 = createMockStep('step2', 'search', []);
      const phase = createMockPhase('test-phase', [step1, step2]);
      const context = createMockContext();

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: 'test result',
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(result.stepResults).toHaveLength(2);
      // Both steps should be executed
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it('should execute steps sequentially when dependencies exist', async () => {
      const step1 = createMockStep('step1', 'search', []);
      const step2 = createMockStep('step2', 'fetch', ['step1']);
      const phase = createMockPhase('test-phase', [step1, step2]);
      const context = createMockContext();

      let step1Completed = false;
      const mockStepExecutor = {
        execute: jest.fn().mockImplementation((step) => {
          if (step.id === 'step1') {
            step1Completed = true;
          } else if (step.id === 'step2') {
            // step2 should only execute after step1
            expect(step1Completed).toBe(true);
          }
          return Promise.resolve({ output: 'test result', tokensUsed: 100 });
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      const result = await executor.execute(phase, context);

      expect(result.status).toBe('completed');
      expect(result.stepResults).toHaveLength(2);
    });
  });

  describe('buildExecutionQueue', () => {
    it('should create single batch for independent steps', () => {
      const step1 = createMockStep('step1', 'search', []);
      const step2 = createMockStep('step2', 'search', []);

      // Access protected method via type assertion
      const queue = (executor as any).buildExecutionQueue([step1, step2]);

      expect(queue).toHaveLength(1);
      expect(queue[0]).toHaveLength(2);
    });

    it('should create multiple batches for dependent steps', () => {
      const step1 = createMockStep('step1', 'search', []);
      const step2 = createMockStep('step2', 'fetch', ['step1']);

      const queue = (executor as any).buildExecutionQueue([step1, step2]);

      expect(queue).toHaveLength(2);
      expect(queue[0]).toHaveLength(1);
      expect(queue[0][0].id).toBe('step1');
      expect(queue[1]).toHaveLength(1);
      expect(queue[1][0].id).toBe('step2');
    });

    it('should handle complex dependency chains', () => {
      const step1 = createMockStep('step1', 'search', []);
      const step2 = createMockStep('step2', 'search', []);
      const step3 = createMockStep('step3', 'fetch', ['step1', 'step2']);
      const step4 = createMockStep('step4', 'synthesize', ['step3']);

      const queue = (executor as any).buildExecutionQueue([
        step1,
        step2,
        step3,
        step4,
      ]);

      expect(queue).toHaveLength(3);
      // Batch 1: step1 and step2 (parallel)
      expect(queue[0]).toHaveLength(2);
      // Batch 2: step3 (depends on step1, step2)
      expect(queue[1]).toHaveLength(1);
      expect(queue[1][0].id).toBe('step3');
      // Batch 3: step4 (depends on step3)
      expect(queue[2]).toHaveLength(1);
      expect(queue[2][0].id).toBe('step4');
    });
  });

  describe('executeStep', () => {
    it('should enrich synthesize steps', async () => {
      const step = createMockStep('step1', 'synthesize', []);
      const context = createMockContext();
      const phaseResults: StepResult[] = [];

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: 'synthesized result',
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      await (executor as any).executeStep(step, context, phaseResults);

      expect(stepConfiguration.enrichSynthesizeStep).toHaveBeenCalledWith(
        step,
        context.plan,
        phaseResults,
      );
    });

    it('should provide default config when missing', async () => {
      const step = createMockStep('step1', 'search', []);
      step.config = {};
      const context = createMockContext();
      const phaseResults: StepResult[] = [];

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: 'result',
          tokensUsed: 100,
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      await (executor as any).executeStep(step, context, phaseResults);

      expect(stepConfiguration.getDefaultConfig).toHaveBeenCalledWith(
        'search',
        context.plan,
        phaseResults,
      );
    });

    it('should emit step events correctly', async () => {
      const step = createMockStep('step1', 'search', []);
      step.phaseId = 'phase1';
      const context = createMockContext();
      const phaseResults: StepResult[] = [];

      const mockStepExecutor = {
        execute: jest.fn().mockResolvedValue({
          output: 'result',
          tokensUsed: 100,
          metadata: { source: 'test' },
        }),
      };
      executorRegistry.getExecutor.mockReturnValue(mockStepExecutor);

      await (executor as any).executeStep(step, context, phaseResults);

      // Should emit step_started
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        context.logId,
        'step_started',
        expect.objectContaining({
          stepId: 'step1',
          toolName: 'search',
        }),
        'phase1',
        'step1',
      );

      // Should emit step_completed
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        context.logId,
        'step_completed',
        expect.objectContaining({
          stepId: 'step1',
          toolName: 'search',
          output: 'result',
          tokensUsed: 100,
        }),
        'phase1',
        'step1',
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
