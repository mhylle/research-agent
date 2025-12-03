import { Injectable } from '@nestjs/common';
import { ResearchLogger } from '../../logging/research-logger.service';
import { ConfidenceScoringService } from '../../evaluation/services/confidence-scoring.service';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { WorkingMemoryService } from '../../orchestration/services/working-memory.service';
import { ReflectionConfig, ReflectionResult, ReflectionStep } from '../interfaces';
import { GapDetectorService } from './gap-detector.service';
import { SelfCritiqueEngineService } from './self-critique-engine.service';
import { RefinementEngineService } from './refinement-engine.service';

@Injectable()
export class ReflectionService {
  constructor(
    private readonly confidenceScoring: ConfidenceScoringService,
    private readonly eventCoordinator: EventCoordinatorService,
    private readonly logger: ResearchLogger,
    private readonly workingMemory: WorkingMemoryService,
    private readonly gapDetector: GapDetectorService,
    private readonly selfCritiqueEngine: SelfCritiqueEngineService,
    private readonly refinementEngine: RefinementEngineService,
  ) {}

  async reflect(
    taskId: string,
    initialAnswer: string,
    config: ReflectionConfig,
  ): Promise<ReflectionResult> {
    this.logger.log(taskId, 'reflection', 'reflect_initialized', {
      maxIterations: config.maxIterations,
    });

    // Handle edge case: zero iterations
    if (config.maxIterations === 0) {
      return {
        iterationCount: 0,
        improvements: [],
        identifiedGaps: [],
        finalAnswer: initialAnswer,
        finalConfidence: 0,
        reflectionTrace: [],
      };
    }

    // Emit reflection started event
    await this.eventCoordinator.emit(taskId, 'reflection_started', {
      maxIterations: config.maxIterations,
      initialAnswerLength: initialAnswer.length,
    });

    const reflectionTrace: ReflectionStep[] = [];
    let currentAnswer = initialAnswer;
    let iteration = 0;
    let previousConfidence = 0;

    // Default empty sources for now - in real implementation these would come from working memory
    const sources = [];
    const claims = [];
    const claimConfidences = [];
    const entailmentResults = [];
    const query = ''; // Query would be extracted from working memory in real implementation

    while (iteration < config.maxIterations) {
      iteration++;

      try {
        // Step 1: Detect gaps
        const gaps = await this.gapDetector.detectGaps(
          currentAnswer,
          sources,
          claims,
          claimConfidences,
          entailmentResults,
          query,
          taskId,
        );

        // Step 2: Generate critique (pass previousConfidence as mock ConfidenceResult)
        const mockConfidenceResult = {
          overallConfidence: previousConfidence,
          level: 'medium' as const,
          claimConfidences: [],
          methodology: {
            entailmentWeight: 0.5,
            suScoreWeight: 0.3,
            sourceCountWeight: 0.2,
          },
          recommendations: [],
        };

        const critique = await this.selfCritiqueEngine.critiqueSynthesis(
          currentAnswer,
          sources,
          query,
          mockConfidenceResult,
          gaps,
          taskId,
        );

        // Step 3: Refine answer using RefinementEngineService
        const refinementResult = await this.refinementEngine.refineAnswer(
          currentAnswer,
          critique,
          gaps,
          sources,
          query,
          taskId,
        );
        const refinedAnswer = refinementResult.finalAnswer;

        // Step 4: Get confidence score for refined answer
        const newConfidenceResult = await this.confidenceScoring.scoreConfidence(
          refinedAnswer,
          sources,
          taskId,
        );
        const newConfidence = newConfidenceResult.overallConfidence;
        const improvement = newConfidence - previousConfidence;

        // Step 5: Record iteration in trace
        reflectionTrace.push({
          iteration,
          critique: critique.overallAssessment,
          gapsFound: gaps,
          confidenceBefore: previousConfidence,
          confidenceAfter: newConfidence,
          improvement,
        });

        // Step 6: Add gaps to working memory (convert severity if needed)
        for (const gap of gaps) {
          // Convert gap severity from reflection format to working memory format
          const workingMemoryGap = {
            description: gap.description,
            severity: gap.severity === 'major' ? 'important' : gap.severity,
            suggestedAction: gap.suggestedAction,
          } as const;
          await this.workingMemory.addGap(taskId, workingMemoryGap as any);
        }

        // Step 7: Emit reflection iteration event
        await this.eventCoordinator.emit(taskId, 'reflection_iteration', {
          iteration,
          gapsFound: gaps.length,
          confidence: newConfidence,
          improvement,
        });

        // Step 8: Check termination conditions
        // Quality target reached?
        if (newConfidence >= config.qualityTargetThreshold) {
          this.logger.log(taskId, 'reflection', 'quality_target_reached', {
            confidence: newConfidence,
          });
          currentAnswer = refinedAnswer;
          previousConfidence = newConfidence;
          break;
        }

        // Diminishing returns? (only check after first iteration)
        if (iteration > 1 && improvement < config.minImprovementThreshold) {
          this.logger.log(taskId, 'reflection', 'diminishing_returns', {
            improvement,
          });
          break;
        }

        // Update for next iteration
        currentAnswer = refinedAnswer;
        previousConfidence = newConfidence;
      } catch (error) {
        // Handle errors gracefully - log and return current state
        this.logger.log(taskId, 'reflection', 'iteration_error', {
          error: error.message,
          iteration,
        });

        // Return result with what we have so far
        await this.eventCoordinator.emit(taskId, 'reflection_completed', {
          iterationCount: iteration - 1,
          finalConfidence: previousConfidence,
          error: error.message,
        });

        return {
          iterationCount: iteration - 1,
          improvements: reflectionTrace.map((s) => s.improvement),
          identifiedGaps: reflectionTrace.flatMap((s) => s.gapsFound),
          finalAnswer: currentAnswer,
          finalConfidence: previousConfidence,
          reflectionTrace,
        };
      }
    }

    // Emit reflection completed event
    await this.eventCoordinator.emit(taskId, 'reflection_completed', {
      iterationCount: iteration,
      finalConfidence: previousConfidence,
      improvementsCount: reflectionTrace.length,
    });

    return {
      iterationCount: iteration,
      improvements: reflectionTrace.map((s) => s.improvement),
      identifiedGaps: reflectionTrace.flatMap((s) => s.gapsFound),
      finalAnswer: currentAnswer,
      finalConfidence: previousConfidence,
      reflectionTrace,
    };
  }
}
