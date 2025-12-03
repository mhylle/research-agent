// src/orchestration/phase-executors/synthesis-phase-executor.ts
import { Injectable, Logger } from '@nestjs/common';
import { BasePhaseExecutor } from './base-phase-executor';
import { Phase, PhaseResult } from '../interfaces/phase.interface';
import { PhaseExecutionContext } from './interfaces/phase-execution-context';
import { ConfidenceScoringService } from '../../evaluation/services/confidence-scoring.service';
import { EventCoordinatorService } from '../services/event-coordinator.service';
import { MilestoneService } from '../services/milestone.service';
import { ExecutorRegistry } from '../../executors/executor-registry.service';
import { StepConfigurationService } from '../services/step-configuration.service';
import { ConfidenceResult } from '../../evaluation/interfaces/confidence.interface';
import { ReflectionService } from '../../reflection/services/reflection.service';
import { ReflectionConfig } from '../../reflection/interfaces';

interface Source {
  id: string;
  url: string;
  content: string;
  title?: string;
  relevance?: number;
}

/**
 * Executor for synthesis/answer/generation phases.
 * Extends base executor to integrate confidence scoring after synthesis.
 * Synthesis steps are enriched by StepConfigurationService via base class executeStep().
 */
@Injectable()
export class SynthesisPhaseExecutor extends BasePhaseExecutor {
  private readonly logger = new Logger(SynthesisPhaseExecutor.name);

  constructor(
    eventCoordinator: EventCoordinatorService,
    milestoneService: MilestoneService,
    executorRegistry: ExecutorRegistry,
    stepConfiguration: StepConfigurationService,
    private readonly confidenceScoringService: ConfidenceScoringService,
    private readonly reflectionService: ReflectionService,
  ) {
    super(eventCoordinator, milestoneService, executorRegistry, stepConfiguration);
  }

  /**
   * Handles phases with 'synth', 'answer', or 'generat' in the name
   */
  canHandle(phase: Phase): boolean {
    const phaseName = phase.name.toLowerCase();
    return (
      phaseName.includes('synth') ||
      phaseName.includes('answer') ||
      phaseName.includes('generat')
    );
  }

  /**
   * Get reflection configuration from environment variables
   */
  private getReflectionConfig(): ReflectionConfig {
    return {
      maxIterations: parseInt(process.env.REFLECTION_MAX_ITERATIONS || '3', 10),
      minImprovementThreshold: parseFloat(process.env.REFLECTION_MIN_IMPROVEMENT || '0.05'),
      qualityTargetThreshold: parseFloat(process.env.REFLECTION_QUALITY_TARGET || '0.9'),
      timeoutPerIteration: parseInt(process.env.REFLECTION_TIMEOUT_PER_ITERATION || '30000', 10),
    };
  }

  /**
   * Check if reflection is enabled via environment variables
   */
  private isReflectionEnabled(): boolean {
    return process.env.REFLECTION_ENABLED !== 'false'; // enabled by default
  }

  /**
   * Override execute to add confidence scoring and reflection after synthesis
   */
  async execute(
    phase: Phase,
    context: PhaseExecutionContext,
  ): Promise<PhaseResult> {
    // Execute the synthesis phase normally
    const result = await super.execute(phase, context);

    // Only attempt post-synthesis processing if synthesis succeeded
    if (result.status === 'completed') {
      try {
        // Extract answer text and sources for post-processing
        const answerText = this.extractAnswerText(result.stepResults);
        const sources = this.extractSources(context.allPreviousResults);

        if (!answerText || sources.length === 0) {
          if (!answerText) {
            this.logger.warn('No answer text found in synthesis results, skipping post-synthesis processing');
          }
          if (sources.length === 0) {
            this.logger.warn('No sources found in previous results, skipping post-synthesis processing');
          }
          return result;
        }

        // Run confidence scoring
        const confidenceResult = await this.runConfidenceScoring(
          answerText,
          sources,
          phase,
          context,
        );

        // Run reflection if enabled
        if (this.isReflectionEnabled()) {
          await this.runReflection(answerText, sources, context, result, confidenceResult);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Post-synthesis processing failed: ${errorMessage}`);
        // Don't fail the synthesis phase due to post-processing errors
      }
    }

    return result;
  }

  /**
   * Run confidence scoring and emit events
   */
  private async runConfidenceScoring(
    answerText: string,
    sources: Source[],
    phase: Phase,
    context: PhaseExecutionContext,
  ): Promise<ConfidenceResult> {
    // Emit confidence scoring started event
    await this.eventCoordinator.emit(
      context.logId,
      'confidence_scoring_started',
      {
        phaseName: phase.name,
        phaseId: phase.id,
      },
      phase.id,
    );

    this.logger.debug(`Extracted ${sources.length} sources for confidence scoring`);

    // Perform confidence scoring
    const confidenceResult = await this.confidenceScoringService.scoreConfidence(
      answerText,
      sources,
      context.logId,
    );

    // Emit confidence scoring completed event
    await this.eventCoordinator.emit(
      context.logId,
      'confidence_scoring_completed',
      {
        phaseName: phase.name,
        phaseId: phase.id,
        confidence: confidenceResult,
      },
      phase.id,
    );

    this.logger.log(
      `Confidence scoring completed: ${confidenceResult.overallConfidence.toFixed(3)} (${confidenceResult.level})`,
    );

    return confidenceResult;
  }

  /**
   * Run reflection on synthesized answer
   */
  private async runReflection(
    answerText: string,
    sources: Source[],
    context: PhaseExecutionContext,
    result: PhaseResult,
    confidenceResult: ConfidenceResult,
  ): Promise<void> {
    const reflectionConfig = this.getReflectionConfig();

    await this.eventCoordinator.emit(
      context.logId,
      'reflection_integration_started',
      { initialConfidence: confidenceResult.overallConfidence },
    );

    try {
      const reflectionResult = await this.reflectionService.reflect(
        context.logId,
        answerText,
        reflectionConfig,
      );

      await this.eventCoordinator.emit(
        context.logId,
        'reflection_integration_completed',
        {
          iterationCount: reflectionResult.iterationCount,
          initialConfidence: confidenceResult.overallConfidence,
          finalConfidence: reflectionResult.finalConfidence,
          improvement: reflectionResult.finalConfidence - confidenceResult.overallConfidence,
          gapsResolved: reflectionResult.identifiedGaps.length,
        },
      );

      this.logger.log(
        `Reflection completed: ${reflectionResult.iterationCount} iterations, ` +
        `confidence: ${confidenceResult.overallConfidence.toFixed(3)} → ${reflectionResult.finalConfidence.toFixed(3)}`,
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Reflection failed: ${errorMessage}`);
      await this.eventCoordinator.emit(
        context.logId,
        'reflection_integration_failed',
        { error: errorMessage },
      );
    }
  }

  /**
   * Extract answer text from synthesis step results
   */
  private extractAnswerText(stepResults: any[]): string | null {
    // Look for synthesis tool output
    const synthesisStep = stepResults.find(
      (step) => step.toolName === 'synthesize' && step.status === 'completed',
    );

    if (synthesisStep?.output) {
      // Handle different output formats
      if (typeof synthesisStep.output === 'string') {
        return synthesisStep.output;
      } else if (synthesisStep.output.answer) {
        return synthesisStep.output.answer;
      } else if (synthesisStep.output.text) {
        return synthesisStep.output.text;
      } else if (synthesisStep.output.content) {
        return synthesisStep.output.content;
      }
    }

    return null;
  }

  /**
   * Extract sources from previous phase results
   */
  private extractSources(previousResults: any[]): Source[] {
    const sources: Source[] = [];

    for (const stepResult of previousResults) {
      if (stepResult.status !== 'completed' || !stepResult.output) {
        continue;
      }

      const output = stepResult.output;

      // Handle tavily_search results - output is directly an array
      if (Array.isArray(output)) {
        for (const result of output) {
          if (result.url && result.content) {
            sources.push({
              id: `source-${sources.length}`,
              url: result.url,
              content: result.content,
              title: result.title,
              relevance: result.score,
            });
          }
        }
      }
      // Handle cases where results is a property (e.g., wrapped response)
      else if (output.results && Array.isArray(output.results)) {
        for (const result of output.results) {
          if (result.url && result.content) {
            sources.push({
              id: `source-${sources.length}`,
              url: result.url,
              content: result.content,
              title: result.title,
              relevance: result.score,
            });
          }
        }
      }

      // Handle fetch_url results
      if (output.url && output.content) {
        sources.push({
          id: `source-${sources.length}`,
          url: output.url,
          content: output.content,
          title: output.title,
        });
      }
    }

    return sources;
  }
}
