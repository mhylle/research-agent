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
   * Override execute to add confidence scoring after synthesis
   */
  async execute(
    phase: Phase,
    context: PhaseExecutionContext,
  ): Promise<PhaseResult> {
    // Execute the synthesis phase normally
    const result = await super.execute(phase, context);

    // Only attempt confidence scoring if synthesis succeeded
    if (result.status === 'completed') {
      try {
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

        // Extract answer text from synthesis step results
        const answerText = this.extractAnswerText(result.stepResults);

        if (!answerText) {
          this.logger.warn('No answer text found in synthesis results, skipping confidence scoring');
          return result;
        }

        // Extract sources from previous results
        const sources = this.extractSources(context.allPreviousResults);
        this.logger.debug(`Extracted ${sources.length} sources for confidence scoring`);
        if (sources.length === 0) {
          this.logger.warn('No sources found in previous results, skipping confidence scoring');
          return result;
        }

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

        // Attach confidence result to phase result (if PhaseResult interface supports metadata)
        // Since PhaseResult doesn't have a metadata field, we'll log it instead
        this.logger.log(
          `Confidence scoring completed: ${confidenceResult.overallConfidence.toFixed(3)} (${confidenceResult.level})`,
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Confidence scoring failed: ${errorMessage}`);

        // Emit confidence scoring failed event
        await this.eventCoordinator.emit(
          context.logId,
          'confidence_scoring_failed',
          {
            phaseName: phase.name,
            phaseId: phase.id,
            error: errorMessage,
          },
          phase.id,
        );

        // Don't fail the synthesis phase due to confidence scoring failure
        // Just log the error and continue
      }
    }

    return result;
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
