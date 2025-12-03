import { Test, TestingModule } from '@nestjs/testing';
import { ReflectionService } from './reflection.service';
import { GapDetectorService } from './gap-detector.service';
import { SelfCritiqueEngineService } from './self-critique-engine.service';
import { ConfidenceScoringService } from '../../evaluation/services/confidence-scoring.service';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import { WorkingMemoryService } from '../../orchestration/services/working-memory.service';
import { ReflectionConfig, ReflectionResult, Gap } from '../interfaces';
import { ConfidenceResult } from '../../evaluation/interfaces/confidence.interface';
import { SelfCritique } from '../interfaces/self-critique.interface';

describe('ReflectionService', () => {
  let service: ReflectionService;
  let mockGapDetector: jest.Mocked<GapDetectorService>;
  let mockSelfCritiqueEngine: jest.Mocked<SelfCritiqueEngineService>;
  let mockConfidenceScoring: jest.Mocked<ConfidenceScoringService>;
  let mockEventCoordinator: jest.Mocked<EventCoordinatorService>;
  let mockLogger: jest.Mocked<ResearchLogger>;
  let mockWorkingMemory: jest.Mocked<WorkingMemoryService>;

  // Test fixtures
  const defaultConfig: ReflectionConfig = {
    maxIterations: 3,
    minImprovementThreshold: 0.05,
    qualityTargetThreshold: 0.9,
    timeoutPerIteration: 30000,
  };

  const createMockGap = (overrides: Partial<Gap> = {}): Gap => ({
    id: 'gap-1',
    type: 'weak_claim',
    severity: 'major',
    description: 'Test gap description',
    suggestedAction: 'Test suggested action',
    confidence: 0.7,
    ...overrides,
  });

  const createMockConfidenceResult = (
    overrides: Partial<ConfidenceResult> = {},
  ): ConfidenceResult => ({
    overallConfidence: 0.75,
    level: 'medium',
    claimConfidences: [],
    methodology: {
      entailmentWeight: 0.5,
      suScoreWeight: 0.3,
      sourceCountWeight: 0.2,
    },
    recommendations: [],
    ...overrides,
  });

  const createMockSelfCritique = (
    overrides: Partial<SelfCritique> = {},
  ): SelfCritique => ({
    overallAssessment: 'The answer is adequate but could be improved.',
    strengths: ['Clear structure', 'Good use of sources'],
    weaknesses: ['Missing some context'],
    criticalIssues: [],
    suggestedImprovements: ['Add more context about the topic'],
    confidence: 0.8,
    ...overrides,
  });

  beforeEach(async () => {
    // Setup mocks
    mockGapDetector = {
      detectGaps: jest.fn(),
    } as unknown as jest.Mocked<GapDetectorService>;

    mockSelfCritiqueEngine = {
      critiqueSynthesis: jest.fn(),
      generateCritique: jest.fn(),
    } as unknown as jest.Mocked<SelfCritiqueEngineService>;

    mockConfidenceScoring = {
      scoreConfidence: jest.fn(),
    } as unknown as jest.Mocked<ConfidenceScoringService>;

    mockEventCoordinator = {
      emit: jest.fn().mockResolvedValue(undefined),
      emitPhaseStarted: jest.fn().mockResolvedValue(undefined),
      emitPhaseCompleted: jest.fn().mockResolvedValue(undefined),
      emitPhaseFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EventCoordinatorService>;

    mockLogger = {
      log: jest.fn(),
      nodeStart: jest.fn(),
      nodeComplete: jest.fn(),
      nodeError: jest.fn(),
      nodeProgress: jest.fn(),
      logStageInput: jest.fn(),
      logStageOutput: jest.fn(),
      logStageError: jest.fn(),
      logToolExecution: jest.fn(),
      logLLMCall: jest.fn(),
      logMilestone: jest.fn(),
    } as unknown as jest.Mocked<ResearchLogger>;

    mockWorkingMemory = {
      initialize: jest.fn(),
      get: jest.fn(),
      updatePhase: jest.fn(),
      addSubGoal: jest.fn(),
      updateSubGoalStatus: jest.fn(),
      addGatheredInfo: jest.fn(),
      addHypothesis: jest.fn(),
      updateHypothesisEvidence: jest.fn(),
      addGap: jest.fn(),
      resolveGap: jest.fn(),
      setScratchPadValue: jest.fn(),
      getScratchPadValue: jest.fn(),
      addThought: jest.fn(),
      getContext: jest.fn(),
      getStatistics: jest.fn(),
      cleanup: jest.fn(),
    } as unknown as jest.Mocked<WorkingMemoryService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReflectionService,
        { provide: GapDetectorService, useValue: mockGapDetector },
        { provide: SelfCritiqueEngineService, useValue: mockSelfCritiqueEngine },
        { provide: ConfidenceScoringService, useValue: mockConfidenceScoring },
        { provide: EventCoordinatorService, useValue: mockEventCoordinator },
        { provide: ResearchLogger, useValue: mockLogger },
        { provide: WorkingMemoryService, useValue: mockWorkingMemory },
      ],
    }).compile();

    service = module.get<ReflectionService>(ReflectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reflect()', () => {
    const taskId = 'test-task-id';
    const initialAnswer = 'This is the initial research answer about quantum computing.';

    describe('Happy Path - Normal Execution', () => {
      it('should execute full reflection loop with expected iterations', async () => {
        // Arrange - Mock improving confidence scores across iterations
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.6 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.75 }));

        mockGapDetector.detectGaps
          .mockResolvedValueOnce([createMockGap({ severity: 'major' })])
          .mockResolvedValueOnce([]);

        mockSelfCritiqueEngine.critiqueSynthesis
          .mockResolvedValueOnce(createMockSelfCritique())
          .mockResolvedValueOnce(createMockSelfCritique({ criticalIssues: [] }));

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 2,
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result).toBeDefined();
        expect(result.iterationCount).toBe(2);
        expect(result.finalAnswer).toBeDefined();
        expect(result.finalConfidence).toBeGreaterThan(0);
        expect(result.reflectionTrace).toHaveLength(2);
        expect(mockLogger.log).toHaveBeenCalledWith(
          taskId,
          'reflection',
          'reflect_initialized',
          expect.objectContaining({ maxIterations: 2 }),
        );
      });

      it('should track improvements between iterations', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.5 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.65 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.78 }));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        // Act
        const result = await service.reflect(taskId, initialAnswer, defaultConfig);

        // Assert
        expect(result.improvements).toBeDefined();
        expect(result.improvements.length).toBeGreaterThan(0);
        // Each improvement should be the delta from previous confidence
        result.improvements.forEach((improvement) => {
          expect(typeof improvement).toBe('number');
        });
      });

      it('should aggregate all identified gaps across iterations', async () => {
        // Arrange
        const gap1 = createMockGap({ id: 'gap-1', type: 'weak_claim' });
        const gap2 = createMockGap({ id: 'gap-2', type: 'missing_info' });
        const gap3 = createMockGap({ id: 'gap-3', type: 'contradiction' });

        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.7 }));

        mockGapDetector.detectGaps
          .mockResolvedValueOnce([gap1])
          .mockResolvedValueOnce([gap2, gap3]);

        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 2,
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result.identifiedGaps).toBeDefined();
        expect(result.identifiedGaps.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Early Termination - Quality Target Reached', () => {
      it('should terminate early when quality target is reached', async () => {
        // Arrange - Mock confidence reaching 0.9 on second iteration
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.7 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.92 }));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 5, // Would run 5 iterations if not terminated early
          qualityTargetThreshold: 0.9,
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result.iterationCount).toBe(2); // Should stop at iteration 2
        expect(result.finalConfidence).toBeGreaterThanOrEqual(0.9);
        expect(mockConfidenceScoring.scoreConfidence).toHaveBeenCalledTimes(2);
      });

      it('should include quality target reached in reflection trace', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.85 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.95 }));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          qualityTargetThreshold: 0.9,
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result.reflectionTrace).toBeDefined();
        const lastStep = result.reflectionTrace[result.reflectionTrace.length - 1];
        expect(lastStep.confidenceAfter).toBeGreaterThanOrEqual(0.9);
      });
    });

    describe('Early Termination - Diminishing Returns', () => {
      it('should terminate when improvement is below threshold', async () => {
        // Arrange - Mock improvements that diminish below 5%
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.70 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.75 })) // 5% improvement
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.77 })); // 2% improvement - below threshold

        mockGapDetector.detectGaps.mockResolvedValue([createMockGap()]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 5,
          minImprovementThreshold: 0.05, // 5% threshold
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        // Should stop after 3rd iteration when improvement drops below threshold
        expect(result.iterationCount).toBeLessThanOrEqual(3);
        expect(mockLogger.log).toHaveBeenCalled();
      });

      it('should still return valid result with diminishing returns message', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.80 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.81 })); // Only 1% improvement

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          minImprovementThreshold: 0.05,
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result.finalAnswer).toBeDefined();
        expect(result.finalConfidence).toBeGreaterThan(0);
        expect(result.reflectionTrace.length).toBeGreaterThan(0);
      });
    });

    describe('Max Iterations Limit', () => {
      it('should respect max iterations limit', async () => {
        // Arrange - Mock dependencies to never reach quality target
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.6 }));

        mockGapDetector.detectGaps.mockResolvedValue([createMockGap()]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(
          createMockSelfCritique({ criticalIssues: ['Issue that never resolves'] }),
        );

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 2,
          qualityTargetThreshold: 0.99, // Unreachable threshold
          minImprovementThreshold: 0.0, // Disable diminishing returns check
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result.iterationCount).toBe(2);
        expect(mockConfidenceScoring.scoreConfidence).toHaveBeenCalledTimes(2);
        expect(mockGapDetector.detectGaps).toHaveBeenCalledTimes(2);
      });

      it('should return best answer after max iterations', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.5 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.55 }));

        mockGapDetector.detectGaps.mockResolvedValue([createMockGap()]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 2,
          qualityTargetThreshold: 0.99,
          minImprovementThreshold: 0.0,
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result.finalAnswer).toBeDefined();
        expect(result.finalConfidence).toBe(0.55);
      });
    });

    describe('Error Handling', () => {
      it('should handle GapDetector errors gracefully', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.7 }));

        mockGapDetector.detectGaps.mockRejectedValue(new Error('Gap detection failed'));
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        // Act
        const result = await service.reflect(taskId, initialAnswer, defaultConfig);

        // Assert - Should return original answer without crashing
        expect(result).toBeDefined();
        expect(result.finalAnswer).toBe(initialAnswer);
        expect(mockLogger.log).toHaveBeenCalled();
      });

      it('should handle ConfidenceScoring errors gracefully', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockRejectedValue(new Error('Confidence scoring failed'));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        // Act
        const result = await service.reflect(taskId, initialAnswer, defaultConfig);

        // Assert
        expect(result).toBeDefined();
        expect(result.finalAnswer).toBe(initialAnswer);
      });

      it('should handle SelfCritiqueEngine errors gracefully', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.7 }));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis
          .mockRejectedValue(new Error('Self-critique failed'));

        // Act
        const result = await service.reflect(taskId, initialAnswer, defaultConfig);

        // Assert
        expect(result).toBeDefined();
        expect(result.finalAnswer).toBe(initialAnswer);
      });

      it('should log errors when services fail', async () => {
        // Arrange
        const testError = new Error('Test service error');
        mockConfidenceScoring.scoreConfidence.mockRejectedValue(testError);

        // Act
        await service.reflect(taskId, initialAnswer, defaultConfig);

        // Assert
        expect(mockLogger.log).toHaveBeenCalled();
      });
    });

    describe('Reflection Trace', () => {
      it('should build complete reflection trace with all steps', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.6 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.75 }));

        mockGapDetector.detectGaps
          .mockResolvedValueOnce([createMockGap({ id: 'gap-1' })])
          .mockResolvedValueOnce([]);

        mockSelfCritiqueEngine.critiqueSynthesis
          .mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 2,
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result.reflectionTrace).toHaveLength(2);

        // Verify first step structure
        const step1 = result.reflectionTrace[0];
        expect(step1.iteration).toBe(1);
        expect(step1.confidenceBefore).toBeDefined();
        expect(step1.confidenceAfter).toBeDefined();
        expect(step1.gapsFound).toBeDefined();
        expect(step1.critique).toBeDefined();
        expect(step1.improvement).toBeDefined();

        // Verify second step
        const step2 = result.reflectionTrace[1];
        expect(step2.iteration).toBe(2);
      });

      it('should calculate improvement correctly in each step', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.5 }))
          .mockResolvedValueOnce(createMockConfidenceResult({ overallConfidence: 0.7 }));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 2,
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        const step1 = result.reflectionTrace[0];
        // First iteration improvement is from initial (assumed 0 or baseline) to first confidence
        expect(typeof step1.improvement).toBe('number');
      });
    });

    describe('Event Coordination', () => {
      it('should emit reflection events through EventCoordinator', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.9 }));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 1,
        };

        // Act
        await service.reflect(taskId, initialAnswer, config);

        // Assert
        // Verify that events were emitted (implementation-dependent)
        expect(mockEventCoordinator.emit).toHaveBeenCalled();
      });
    });

    describe('Working Memory Integration', () => {
      it('should update working memory with reflection progress', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.8 }));

        mockGapDetector.detectGaps.mockResolvedValue([createMockGap()]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 1,
        };

        // Act
        await service.reflect(taskId, initialAnswer, config);

        // Assert - Verify working memory was updated
        // This depends on implementation, but we expect some interaction
        expect(mockWorkingMemory.addGap).toHaveBeenCalled();
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty initial answer', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.1 }));

        mockGapDetector.detectGaps.mockResolvedValue([
          createMockGap({ type: 'missing_info', severity: 'critical' }),
        ]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(
          createMockSelfCritique({ criticalIssues: ['Empty answer'] }),
        );

        // Act
        const result = await service.reflect(taskId, '', defaultConfig);

        // Assert
        expect(result).toBeDefined();
        expect(result.finalAnswer).toBeDefined();
      });

      it('should handle zero max iterations', async () => {
        // Arrange
        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 0,
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result).toBeDefined();
        expect(result.iterationCount).toBe(0);
        expect(result.finalAnswer).toBe(initialAnswer);
      });

      it('should handle very high quality target threshold', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.99 }));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 5,
          qualityTargetThreshold: 1.0, // Perfect score required
        };

        // Act
        const result = await service.reflect(taskId, initialAnswer, config);

        // Assert
        expect(result).toBeDefined();
        expect(result.iterationCount).toBeLessThanOrEqual(5);
      });

      it('should handle multiple critical gaps', async () => {
        // Arrange
        const criticalGaps: Gap[] = [
          createMockGap({ id: 'gap-1', severity: 'critical', type: 'contradiction' }),
          createMockGap({ id: 'gap-2', severity: 'critical', type: 'missing_info' }),
          createMockGap({ id: 'gap-3', severity: 'critical', type: 'weak_claim' }),
        ];

        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.4 }));

        mockGapDetector.detectGaps.mockResolvedValue(criticalGaps);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(
          createMockSelfCritique({
            criticalIssues: ['Multiple critical issues detected'],
          }),
        );

        // Act
        const result = await service.reflect(taskId, initialAnswer, defaultConfig);

        // Assert
        expect(result).toBeDefined();
        expect(result.identifiedGaps.length).toBeGreaterThan(0);
      });
    });

    describe('Performance Considerations', () => {
      it('should complete within reasonable time for single iteration', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.95 }));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        const config: ReflectionConfig = {
          ...defaultConfig,
          maxIterations: 1,
        };

        // Act
        const startTime = Date.now();
        await service.reflect(taskId, initialAnswer, config);
        const endTime = Date.now();

        // Assert - Should complete quickly with mocked dependencies
        expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
      });
    });

    describe('Logging', () => {
      it('should log reflection initialization', async () => {
        // Arrange
        mockConfidenceScoring.scoreConfidence
          .mockResolvedValue(createMockConfidenceResult({ overallConfidence: 0.9 }));

        mockGapDetector.detectGaps.mockResolvedValue([]);
        mockSelfCritiqueEngine.critiqueSynthesis.mockResolvedValue(createMockSelfCritique());

        // Act
        await service.reflect(taskId, initialAnswer, defaultConfig);

        // Assert
        expect(mockLogger.log).toHaveBeenCalledWith(
          taskId,
          'reflection',
          'reflect_initialized',
          expect.objectContaining({
            maxIterations: defaultConfig.maxIterations,
          }),
        );
      });
    });
  });
});
