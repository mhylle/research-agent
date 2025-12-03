import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from '../../llm/ollama.service';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import { SelfCritique } from '../interfaces/self-critique.interface';
import { Gap } from '../interfaces/gap.interface';
import {
  RefinementContext,
  RefinementAttempt,
  RefinementResult,
  Source,
} from '../interfaces/refinement-result.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RefinementEngineService {
  private readonly logger = new Logger(RefinementEngineService.name);
  private readonly MAX_REFINEMENT_PASSES = 3;

  constructor(
    private readonly llmService: OllamaService,
    private readonly eventCoordinator: EventCoordinatorService,
    private readonly researchLogger: ResearchLogger,
  ) {}

  /**
   * Refine an answer based on critique and gaps using multi-pass strategy
   * @param originalAnswer - The answer to refine
   * @param critique - Self-critique of the answer
   * @param gaps - Identified knowledge gaps
   * @param sources - Available sources for refinement
   * @param query - The original research query
   * @param logId - Optional log ID for tracking
   * @returns Refinement result with history and metrics
   */
  async refineAnswer(
    originalAnswer: string,
    critique: SelfCritique,
    gaps: Gap[],
    sources: Source[],
    query: string,
    logId?: string,
  ): Promise<RefinementResult> {
    const startTime = Date.now();
    this.logger.log(
      `Starting refinement for answer (${originalAnswer.length} chars) with ${gaps.length} gaps`,
    );

    if (logId) {
      this.researchLogger.nodeStart(
        'refinement-engine',
        logId,
        'stage',
        'reflection',
      );
      await this.eventCoordinator.emit(logId, 'refinement_started', {
        originalAnswerLength: originalAnswer.length,
        gapCount: gaps.length,
        criticalGapCount: gaps.filter((g) => g.severity === 'critical').length,
        sourceCount: sources.length,
      });
    }

    try {
      const refinementHistory: RefinementAttempt[] = [];
      let currentAnswer = originalAnswer;
      let remainingGaps = [...gaps];

      // Multi-pass refinement strategy (max 3 passes)
      for (let iteration = 1; iteration <= this.MAX_REFINEMENT_PASSES; iteration++) {
        this.logger.debug(`Starting refinement pass ${iteration}/${this.MAX_REFINEMENT_PASSES}`);

        if (logId) {
          await this.eventCoordinator.emit(logId, 'refinement_pass', {
            iteration,
            remainingGaps: remainingGaps.length,
          });
        }

        // Build context for this iteration
        const context: RefinementContext = {
          originalAnswer,
          critique,
          gaps: remainingGaps,
          sources,
          iteration,
          previousAttempts: refinementHistory,
        };

        // Perform refinement pass
        const attempt = await this.performRefinementPass(
          currentAnswer,
          context,
          query,
          logId,
        );

        refinementHistory.push(attempt);
        currentAnswer = attempt.refinedAnswer;

        // Update remaining gaps
        remainingGaps = remainingGaps.filter(
          (gap) => !attempt.addressedGaps.includes(gap.id),
        );

        this.logger.debug(
          `Pass ${iteration} completed: ${attempt.addressedGaps.length} gaps addressed, ${remainingGaps.length} remaining`,
        );

        // Stop if no significant improvement or all gaps addressed
        if (remainingGaps.length === 0) {
          this.logger.log(
            `Stopping refinement early: all gaps addressed`,
          );
          break;
        }

        // Stop if improvement is too low (but only after first pass)
        if (iteration > 1 && attempt.improvement < 0.1) {
          this.logger.log(
            `Stopping refinement early: improvement too low (${attempt.improvement.toFixed(3)})`,
          );
          break;
        }
      }

      // Calculate final metrics
      const totalImprovement = this.calculateTotalImprovement(refinementHistory);
      const gapsResolved = gaps.length - remainingGaps.length;

      const result: RefinementResult = {
        finalAnswer: currentAnswer,
        refinementHistory,
        totalImprovement,
        gapsResolved,
        gapsRemaining: remainingGaps.length,
      };

      const executionTime = Date.now() - startTime;
      this.logger.log(
        `Refinement completed in ${executionTime}ms: ${gapsResolved}/${gaps.length} gaps resolved, ${(totalImprovement * 100).toFixed(1)}% improvement`,
      );

      if (logId) {
        this.researchLogger.nodeComplete('refinement-engine', logId, {
          passCount: refinementHistory.length,
          gapsResolved,
          gapsRemaining: remainingGaps.length,
          totalImprovement,
          executionTime,
        });

        await this.eventCoordinator.emit(logId, 'refinement_completed', {
          result,
          executionTime,
        });
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(
        `Refinement failed after ${executionTime}ms: ${error.message}`,
      );

      if (logId) {
        this.researchLogger.nodeError('refinement-engine', logId, error);
        await this.eventCoordinator.emit(logId, 'refinement_failed', {
          error: error.message,
          executionTime,
        });
      }

      // Return fallback result with original answer
      return this.createFallbackResult(originalAnswer, gaps, error.message);
    }
  }

  /**
   * Perform a single refinement pass
   */
  private async performRefinementPass(
    currentAnswer: string,
    context: RefinementContext,
    query: string,
    logId?: string,
  ): Promise<RefinementAttempt> {
    // Build refinement prompt
    const prompt = this.buildRefinementPrompt(currentAnswer, context, query);

    this.logger.debug('Calling LLM for refinement...');

    // Call LLM for refinement - let errors propagate
    const response = await this.llmService.chat([
      {
        role: 'system',
        content:
          'You are an expert research writer tasked with refining answers based on critical feedback. Produce clear, well-cited, accurate improvements.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    const refinedAnswer = response.message.content.trim();

    // Analyze which gaps were addressed
    const addressedGaps = await this.identifyAddressedGaps(
      currentAnswer,
      refinedAnswer,
      context.gaps,
    );

    const remainingGaps = context.gaps
      .filter((g) => !addressedGaps.includes(g.id))
      .map((g) => g.id);

    // Calculate improvement score
    const improvement = this.calculateImprovement(
      currentAnswer,
      refinedAnswer,
      addressedGaps.length,
      context.gaps.length,
    );

    return {
      iteration: context.iteration,
      refinedAnswer,
      improvement,
      addressedGaps,
      remainingGaps,
    };
  }

  /**
   * Build the refinement prompt for LLM
   */
  private buildRefinementPrompt(
    currentAnswer: string,
    context: RefinementContext,
    query: string,
  ): string {
    // Format critique
    const critiqueText = `
Strengths:
${context.critique.strengths.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Weaknesses:
${context.critique.weaknesses.map((w, i) => `${i + 1}. ${w}`).join('\n')}

Critical Issues:
${context.critique.criticalIssues.map((ci, i) => `${i + 1}. ${ci}`).join('\n')}

Suggested Improvements:
${context.critique.suggestedImprovements.map((si, i) => `${i + 1}. ${si}`).join('\n')}
`;

    // Format gaps (prioritize by severity)
    const sortedGaps = [...context.gaps].sort((a, b) => {
      const severityOrder = { critical: 0, major: 1, minor: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    const gapsText = sortedGaps
      .map(
        (g, i) =>
          `${i + 1}. [${g.severity.toUpperCase()}] ${g.type}: ${g.description}
   Suggested Action: ${g.suggestedAction}`,
      )
      .join('\n\n');

    // Format sources
    const sourcesText = context.sources
      .map((s, i) => `[${i + 1}] ${s.title || 'Untitled'} (${s.url})`)
      .join('\n');

    // Format previous attempts (if any)
    const previousAttemptsText =
      context.previousAttempts.length > 0
        ? `
PREVIOUS REFINEMENT ATTEMPTS:
${context.previousAttempts
  .map(
    (attempt) =>
      `Pass ${attempt.iteration}: Addressed ${attempt.addressedGaps.length} gaps, ${(attempt.improvement * 100).toFixed(1)}% improvement`,
  )
  .join('\n')}
`
        : '';

    return `You are refining a research answer based on critical feedback.

ORIGINAL QUERY: "${query}"

CURRENT ANSWER (${context.iteration === 1 ? 'Original' : `After Pass ${context.iteration - 1}`}):
${currentAnswer}

CRITIQUE:
${critiqueText}

IDENTIFIED GAPS (${context.gaps.length} remaining):
${gapsText}

SOURCES AVAILABLE (${context.sources.length} total):
${sourcesText}
${previousAttemptsText}
TASK:
Generate an improved answer that addresses the critique and fills the gaps.

REQUIREMENTS:
1. Address all critical issues first
2. Incorporate suggested improvements
3. Fill identified gaps using available sources
4. Maintain strengths from the current answer
5. Add proper source citations in format [1], [2], etc.
6. Keep the same structure and tone
7. Be concise but comprehensive
8. Focus on the highest priority gaps (critical > major > minor)

REFINED ANSWER:`;
  }

  /**
   * Identify which gaps were addressed in the refined answer
   */
  private async identifyAddressedGaps(
    originalAnswer: string,
    refinedAnswer: string,
    gaps: Gap[],
  ): Promise<string[]> {
    const addressedGaps: string[] = [];

    for (const gap of gaps) {
      // Simple heuristic: Check if refined answer contains keywords from gap description or suggested action
      const gapKeywords = this.extractKeywords(
        gap.description + ' ' + gap.suggestedAction,
      );

      const originalHasKeywords = this.countKeywordMatches(
        originalAnswer,
        gapKeywords,
      );
      const refinedHasKeywords = this.countKeywordMatches(
        refinedAnswer,
        gapKeywords,
      );

      // If refined answer has significantly more keyword matches, consider gap addressed
      if (refinedHasKeywords > originalHasKeywords + 1) {
        addressedGaps.push(gap.id);
      }
    }

    return addressedGaps;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction: lowercase, split by non-word characters, filter short words
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3);
  }

  /**
   * Count keyword matches in text
   */
  private countKeywordMatches(text: string, keywords: string[]): number {
    const lowerText = text.toLowerCase();
    return keywords.filter((keyword) => lowerText.includes(keyword)).length;
  }

  /**
   * Calculate improvement score for a refinement pass
   */
  private calculateImprovement(
    originalAnswer: string,
    refinedAnswer: string,
    addressedGapsCount: number,
    totalGapsCount: number,
  ): number {
    // Factor 1: Gaps addressed (60%)
    const gapFactor =
      totalGapsCount > 0 ? addressedGapsCount / totalGapsCount : 0;

    // Factor 2: Answer length change (20%)
    // Penalize too much reduction, reward reasonable expansion
    const lengthRatio = refinedAnswer.length / originalAnswer.length;
    const lengthFactor =
      lengthRatio >= 0.9 && lengthRatio <= 1.3 ? 1 : Math.max(0, 1 - Math.abs(1 - lengthRatio));

    // Factor 3: Structural improvements (20%)
    // Check for citations, paragraphs, etc.
    const originalCitations = (originalAnswer.match(/\[\d+\]/g) || []).length;
    const refinedCitations = (refinedAnswer.match(/\[\d+\]/g) || []).length;
    const structuralFactor = refinedCitations > originalCitations ? 1 : 0.5;

    // Combine factors
    const improvement =
      gapFactor * 0.6 + lengthFactor * 0.2 + structuralFactor * 0.2;

    return Math.min(Math.max(improvement, 0), 1);
  }

  /**
   * Calculate total improvement across all refinement passes
   */
  private calculateTotalImprovement(
    refinementHistory: RefinementAttempt[],
  ): number {
    if (refinementHistory.length === 0) return 0;

    // Sum improvements with diminishing returns for later passes
    let totalImprovement = 0;
    for (let i = 0; i < refinementHistory.length; i++) {
      const weight = 1 / (i + 1); // First pass: 1.0, second: 0.5, third: 0.33
      totalImprovement += refinementHistory[i].improvement * weight;
    }

    // Normalize by sum of weights
    const weightSum = refinementHistory.reduce(
      (sum, _, i) => sum + 1 / (i + 1),
      0,
    );

    return totalImprovement / weightSum;
  }

  /**
   * Create a fallback result when refinement fails
   */
  private createFallbackResult(
    originalAnswer: string,
    gaps: Gap[],
    errorMessage: string,
  ): RefinementResult {
    this.logger.warn(`Creating fallback result due to: ${errorMessage}`);

    return {
      finalAnswer: originalAnswer,
      refinementHistory: [],
      totalImprovement: 0,
      gapsResolved: 0,
      gapsRemaining: gaps.length,
    };
  }
}
