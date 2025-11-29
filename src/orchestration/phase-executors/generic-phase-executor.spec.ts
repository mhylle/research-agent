import { Test, TestingModule } from '@nestjs/testing';
import { GenericPhaseExecutor } from './generic-phase-executor';
import { EventCoordinatorService } from '../services/event-coordinator.service';
import { MilestoneService } from '../services/milestone.service';
import { ExecutorRegistry } from '../../executors/executor-registry.service';
import { StepConfigurationService } from '../services/step-configuration.service';
import { Phase } from '../interfaces/phase.interface';
import { PhaseExecutionContext } from './interfaces/phase-execution-context';
import { PlanStep } from '../interfaces/plan-step.interface';

describe('GenericPhaseExecutor', () => {
  let executor: GenericPhaseExecutor;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;
  let executorRegistry: jest.Mocked<ExecutorRegistry>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenericPhaseExecutor,
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

    executor = module.get<GenericPhaseExecutor>(GenericPhaseExecutor);
    eventCoordinator = module.get(EventCoordinatorService);
    executorRegistry = module.get(ExecutorRegistry);
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
  });

  describe('canHandle', () => {
    it('should handle any phase (fallback executor)', () => {
      const phases = [
        createMockPhase('search-phase'),
        createMockPhase('fetch-phase'),
        createMockPhase('synthesis-phase'),
        createMockPhase('random-phase'),
        createMockPhase('whatever-phase'),
      ];

      phases.forEach((phase) => {
        expect(executor.canHandle(phase)).toBe(true);
      });
    });
  });

  describe('execute', () => {
    it('should use default execution from base class', async () => {
      const phase = createMockPhase('generic-phase', [
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

      // Should follow standard lifecycle
      expect(eventCoordinator.emitPhaseStarted).toHaveBeenCalled();
      expect(mockStepExecutor.execute).toHaveBeenCalled();
      expect(eventCoordinator.emitPhaseCompleted).toHaveBeenCalled();
      expect(result.status).toBe('completed');
    });

    it('should handle multiple independent steps', async () => {
      const phase = createMockPhase('generic-phase', [
        createMockStep('step1', 'search', []),
        createMockStep('step2', 'search', []),
        createMockStep('step3', 'search', []),
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

      expect(result.status).toBe('completed');
      expect(result.stepResults).toHaveLength(3);
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(3);
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
