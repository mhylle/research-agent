import { Injectable, Logger } from '@nestjs/common';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { ScoreAggregatorService } from './score-aggregator.service';
import { AnswerDimensionScores, EvaluatorResult } from '../interfaces';

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

  private readonly ANSWER_WEIGHTS: Record<string, number> = {
    faithfulness: 0.30,
    relevance: 0.25,
    factualAccuracy: 0.20,
    completeness: 0.15,
    coherence: 0.10,
  };

  private readonly MAJOR_FAILURE_THRESHOLD = 0.5;

  constructor(
    private readonly panelEvaluator: PanelEvaluatorService,
    private readonly scoreAggregator: ScoreAggregatorService,
  ) {}

  async evaluate(input: AnswerEvaluationInput): Promise<AnswerEvaluationResult> {
    this.logger.log(`Evaluating answer for query: ${input.query.substring(0, 50)}...`);

    try {
      // Use all relevant evaluator roles for answer evaluation
      const evaluatorResults = await this.panelEvaluator.evaluateWithPanel(
        ['faithfulnessJudge', 'intentAnalyst', 'factChecker', 'coverageChecker', 'qualityAssessor'],
        {
          query: input.query,
          plan: { answer: input.answer }, // Pass answer in plan for now
          searchQueries: input.sources.map(s => s.content),
        },
      );

      const aggregated = this.scoreAggregator.aggregateScores(evaluatorResults);
      const overallScore = this.scoreAggregator.calculateOverallScore(
        aggregated.scores,
        this.ANSWER_WEIGHTS,
      );

      const passed = overallScore >= this.MAJOR_FAILURE_THRESHOLD;
      const shouldRegenerate = overallScore < this.MAJOR_FAILURE_THRESHOLD;

      if (shouldRegenerate) {
        this.logger.warn(`Answer flagged for regeneration: ${overallScore.toFixed(2)}`);
      }

      const critique = this.buildCritique(evaluatorResults);
      const suggestions = this.extractSuggestions(evaluatorResults);

      return {
        passed,
        scores: aggregated.scores as AnswerDimensionScores,
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
          relevance: 0,
          factualAccuracy: 0,
          completeness: 0,
          coherence: 0,
        },
        confidence: 0,
        shouldRegenerate: false,
        critique: '',
        improvementSuggestions: [],
        evaluationSkipped: true,
        skipReason: error.message,
      };
    }
  }

  private buildCritique(results: EvaluatorResult[]): string {
    return results
      .filter(r => r.critique)
      .map(r => `[${r.role}]: ${r.critique}`)
      .join('\n');
  }

  private extractSuggestions(results: EvaluatorResult[]): string[] {
    // Would parse evaluator responses for specific suggestions
    // For now, generate generic suggestions based on low scores
    const suggestions: string[] = [];

    for (const result of results) {
      for (const [dimension, score] of Object.entries(result.scores)) {
        if (typeof score === 'number' && score < 0.6) {
          suggestions.push(`Improve ${dimension} (currently ${(score * 100).toFixed(0)}%)`);
        }
      }
    }

    return [...new Set(suggestions)]; // Deduplicate
  }
}
