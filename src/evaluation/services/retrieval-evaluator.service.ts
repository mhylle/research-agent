import { Injectable, Logger } from '@nestjs/common';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { ScoreAggregatorService } from './score-aggregator.service';
import { RetrievalDimensionScores } from '../interfaces';

export interface RetrievalContent {
  url: string;
  content: string;
  title?: string;
  fetchedAt?: Date;
}

export interface RetrievalEvaluationInput {
  query: string;
  retrievedContent: RetrievalContent[];
}

export interface RetrievalEvaluationResult {
  passed: boolean;
  scores: RetrievalDimensionScores;
  confidence: number;
  flaggedSevere: boolean;
  sourceDetails: Array<{
    url: string;
    relevanceScore: number;
    qualityScore: number;
  }>;
  evaluationSkipped: boolean;
  skipReason?: string;
}

@Injectable()
export class RetrievalEvaluatorService {
  private readonly logger = new Logger(RetrievalEvaluatorService.name);

  private readonly RETRIEVAL_WEIGHTS: Record<string, number> = {
    contextRecall: 0.40,
    contextPrecision: 0.35,
    sourceQuality: 0.25,
  };

  private readonly SEVERE_THRESHOLD = 0.5;

  constructor(
    private readonly panelEvaluator: PanelEvaluatorService,
    private readonly scoreAggregator: ScoreAggregatorService,
  ) {}

  async evaluate(input: RetrievalEvaluationInput): Promise<RetrievalEvaluationResult> {
    this.logger.log(`Evaluating retrieval for query: ${input.query.substring(0, 50)}...`);

    try {
      // Use relevant evaluator roles for retrieval
      const evaluatorResults = await this.panelEvaluator.evaluateWithPanel(
        ['faithfulnessJudge', 'coverageChecker', 'qualityAssessor'],
        {
          query: input.query,
          plan: {}, // Not used for retrieval
          searchQueries: input.retrievedContent.map(c => c.url),
        },
      );

      const aggregated = this.scoreAggregator.aggregateScores(evaluatorResults);
      const overallScore = this.scoreAggregator.calculateOverallScore(
        aggregated.scores,
        this.RETRIEVAL_WEIGHTS,
      );

      const passed = overallScore >= this.SEVERE_THRESHOLD;
      const flaggedSevere = overallScore < this.SEVERE_THRESHOLD;

      if (flaggedSevere) {
        this.logger.warn(`Retrieval flagged as severe failure: ${overallScore.toFixed(2)}`);
      }

      return {
        passed,
        scores: aggregated.scores as RetrievalDimensionScores,
        confidence: aggregated.confidence,
        flaggedSevere,
        sourceDetails: this.buildSourceDetails(input.retrievedContent, evaluatorResults),
        evaluationSkipped: false,
      };
    } catch (error) {
      this.logger.error(`Retrieval evaluation failed: ${error.message}`);
      return {
        passed: true, // Fail-safe: don't block on evaluation failure
        scores: { contextRecall: 0, contextPrecision: 0, sourceQuality: 0 },
        confidence: 0,
        flaggedSevere: false,
        sourceDetails: [],
        evaluationSkipped: true,
        skipReason: error.message,
      };
    }
  }

  private buildSourceDetails(
    content: RetrievalContent[],
    evaluatorResults: any[],
  ): Array<{ url: string; relevanceScore: number; qualityScore: number }> {
    // For now, return basic source info
    // In full implementation, would parse evaluator critiques for per-source scores
    return content.map(c => ({
      url: c.url,
      relevanceScore: 0.5, // Default placeholder
      qualityScore: 0.5,
    }));
  }
}
