import { Injectable, Logger } from '@nestjs/common';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { ScoreAggregatorService } from './score-aggregator.service';
import {
  AnswerDimensionScores,
  EvaluatorResult,
  DEFAULT_EVALUATION_CONFIG,
} from '../interfaces';

export interface AnswerSource {
  url: string;
  content: string;
  title?: string;
}

export interface AnswerEvaluationInput {
  query: string;
  answer: string;
  sources: AnswerSource[];
}

export interface AnswerEvaluationResult {
  passed: boolean;
  scores: AnswerDimensionScores;
  explanations?: Record<string, string>;
  confidence: number;
  shouldRegenerate: boolean;
  critique: string;
  improvementSuggestions: string[];
  evaluationSkipped: boolean;
  skipReason?: string;
}

@Injectable()
export class AnswerEvaluatorService {
  private readonly logger = new Logger(AnswerEvaluatorService.name);
  private readonly config = DEFAULT_EVALUATION_CONFIG;

  private readonly ANSWER_WEIGHTS: Record<string, number> = {
    faithfulness: 0.35,
    answerRelevance: 0.3,
    completeness: 0.2,
    accuracy: 0.15,
  };

  private readonly MAJOR_FAILURE_THRESHOLD = 0.5;

  constructor(
    private readonly panelEvaluator: PanelEvaluatorService,
    private readonly scoreAggregator: ScoreAggregatorService,
  ) {}

  async evaluate(
    input: AnswerEvaluationInput,
  ): Promise<AnswerEvaluationResult> {
    this.logger.log(
      `Evaluating answer for query: ${input.query.substring(0, 50)}...`,
    );

    try {
      // Skip evaluation if no answer was generated
      if (!input.answer || input.answer.trim().length === 0) {
        this.logger.warn('No answer generated, skipping answer evaluation');
        return {
          passed: false,
          scores: {
            faithfulness: 0,
            answerRelevance: 0,
            completeness: 0,
            accuracy: 0,
          },
          explanations: {},
          confidence: 0,
          shouldRegenerate: true,
          critique: 'No answer was generated',
          improvementSuggestions: [
            'Generate a comprehensive answer based on retrieved sources',
          ],
          evaluationSkipped: true,
          skipReason: 'No answer generated',
        };
      }

      // Format sources for evaluation
      const sourcesText = this.formatSourcesForEvaluation(input.sources);

      // Use answer-specific evaluator roles
      const evaluatorResults = await this.panelEvaluator.evaluateWithPanel(
        ['faithfulness', 'answerRelevance', 'answerCompleteness'],
        {
          query: input.query,
          plan: {}, // Not used for answer evaluation
          sources: sourcesText,
          answer: input.answer,
        },
      );

      const aggregated = this.scoreAggregator.aggregateScores(evaluatorResults);
      const overallScore = this.scoreAggregator.calculateOverallScore(
        aggregated.scores,
        this.ANSWER_WEIGHTS,
      );

      // Check dimension-specific thresholds
      const dimensionCheck = this.scoreAggregator.checkDimensionThresholds(
        aggregated.scores,
        this.config.answerEvaluation.dimensionThresholds,
      );

      if (!dimensionCheck.passed) {
        this.logger.warn(
          `Answer dimension thresholds not met: ${dimensionCheck.failingDimensions.join(', ')}`,
        );
      }

      // Evaluation passes only if BOTH overall score AND all dimension thresholds are met
      const passed =
        overallScore >= this.MAJOR_FAILURE_THRESHOLD && dimensionCheck.passed;
      const shouldRegenerate = !passed;

      if (shouldRegenerate) {
        const reason = !dimensionCheck.passed
          ? `Dimension thresholds not met: ${dimensionCheck.failingDimensions.join(', ')}`
          : `Overall score too low: ${overallScore.toFixed(2)}`;
        this.logger.warn(`Answer flagged for regeneration: ${reason}`);
      }

      // Extract explanations from evaluator results
      const explanations: Record<string, string> = {};
      for (const result of evaluatorResults) {
        if (result.explanation) {
          for (const dimension of result.dimensions) {
            explanations[dimension] = result.explanation;
          }
        }
      }

      const critique = this.buildCritique(evaluatorResults);
      const suggestions = this.extractSuggestions(evaluatorResults);

      return {
        passed,
        scores: aggregated.scores as AnswerDimensionScores,
        explanations,
        confidence: aggregated.confidence,
        shouldRegenerate,
        critique,
        improvementSuggestions: suggestions,
        evaluationSkipped: false,
      };
    } catch (error) {
      this.logger.error(`Answer evaluation failed: ${error.message}`);
      return {
        passed: true, // Fail-safe: don't block on evaluation failure
        scores: {
          faithfulness: 0,
          answerRelevance: 0,
          completeness: 0,
          accuracy: 0,
        },
        explanations: {},
        confidence: 0,
        shouldRegenerate: false,
        critique: '',
        improvementSuggestions: [],
        evaluationSkipped: true,
        skipReason: error.message,
      };
    }
  }

  private formatSourcesForEvaluation(sources: AnswerSource[]): string {
    if (!sources || sources.length === 0) {
      return 'No sources available';
    }

    return sources
      .map((source, index) => {
        return `
### Source ${index + 1}
- URL: ${source.url}
- Title: ${source.title || 'N/A'}
- Content Preview: ${source.content.substring(0, 500)}...
`;
      })
      .join('\n');
  }

  private buildCritique(results: EvaluatorResult[]): string {
    return results
      .filter((r) => r.critique)
      .map((r) => `[${r.role}]: ${r.critique}`)
      .join('\n');
  }

  private extractSuggestions(results: EvaluatorResult[]): string[] {
    // Would parse evaluator responses for specific suggestions
    // For now, generate generic suggestions based on low scores
    const suggestions: string[] = [];

    for (const result of results) {
      for (const [dimension, score] of Object.entries(result.scores)) {
        if (typeof score === 'number' && score < 0.6) {
          suggestions.push(
            `Improve ${dimension} (currently ${(score * 100).toFixed(0)}%)`,
          );
        }
      }
    }

    return [...new Set(suggestions)]; // Deduplicate
  }
}
