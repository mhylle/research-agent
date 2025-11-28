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
  explanations?: Record<string, string>;
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
      // Format sources for evaluation
      const sourcesText = this.formatSourcesForEvaluation(input.retrievedContent);

      // Use retrieval-specific evaluator roles
      const evaluatorResults = await this.panelEvaluator.evaluateWithPanel(
        ['sourceRelevance', 'sourceQuality', 'coverageCompleteness'],
        {
          query: input.query,
          plan: {}, // Not used for retrieval
          sources: sourcesText,
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

      // Extract explanations from evaluator results
      const explanations: Record<string, string> = {};
      for (const result of evaluatorResults) {
        if (result.explanation) {
          for (const dimension of result.dimensions) {
            explanations[dimension] = result.explanation;
          }
        }
      }

      return {
        passed,
        scores: aggregated.scores as RetrievalDimensionScores,
        explanations,
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
        explanations: {},
        confidence: 0,
        flaggedSevere: false,
        sourceDetails: [],
        evaluationSkipped: true,
        skipReason: error.message,
      };
    }
  }

  private formatSourcesForEvaluation(content: RetrievalContent[]): string {
    return content.map((source, index) => {
      return `
### Source ${index + 1}
- URL: ${source.url}
- Title: ${source.title || 'N/A'}
- Content Preview: ${source.content.substring(0, 300)}...
- Fetched At: ${source.fetchedAt ? source.fetchedAt.toISOString() : 'N/A'}
`;
    }).join('\n');
  }

  private buildSourceDetails(
    content: RetrievalContent[],
    evaluatorResults: any[],
  ): Array<{ url: string; relevanceScore: number; qualityScore: number }> {
    // Extract relevance and quality scores from evaluator results
    const relevanceResult = evaluatorResults.find(r => r.role === 'sourceRelevance');
    const qualityResult = evaluatorResults.find(r => r.role === 'sourceQuality');

    const contextRecall = relevanceResult?.scores?.contextRecall || 0.5;
    const contextPrecision = relevanceResult?.scores?.contextPrecision || 0.5;
    const sourceQuality = qualityResult?.scores?.sourceQuality || 0.5;

    // Build per-source details (simplified - using average scores)
    return content.map(c => ({
      url: c.url,
      relevanceScore: (contextRecall + contextPrecision) / 2,
      qualityScore: sourceQuality,
    }));
  }
}
