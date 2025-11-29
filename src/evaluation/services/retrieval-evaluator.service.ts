import { Injectable, Logger } from '@nestjs/common';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { ScoreAggregatorService } from './score-aggregator.service';
import { RetrievalDimensionScores } from '../interfaces';
import {
  ResultClassifierService,
  ResultType,
} from './result-classifier.service';

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
    resultType?: ResultType;
    actionableScore?: number;
  }>;
  evaluationSkipped: boolean;
  skipReason?: string;
  needsExtraction?: boolean;
  extractionReason?: string;
}

@Injectable()
export class RetrievalEvaluatorService {
  private readonly logger = new Logger(RetrievalEvaluatorService.name);

  private readonly RETRIEVAL_WEIGHTS: Record<string, number> = {
    contextRecall: 0.3,
    contextPrecision: 0.25,
    sourceQuality: 0.2,
    actionableInformation: 0.25,
  };

  private readonly SEVERE_THRESHOLD = 0.5;

  constructor(
    private readonly panelEvaluator: PanelEvaluatorService,
    private readonly scoreAggregator: ScoreAggregatorService,
    private readonly resultClassifier: ResultClassifierService,
  ) {}

  async evaluate(
    input: RetrievalEvaluationInput,
  ): Promise<RetrievalEvaluationResult> {
    this.logger.log(
      `Evaluating retrieval for query: ${input.query.substring(0, 50)}...`,
    );

    try {
      // Step 1: Classify results to detect aggregators
      const classifications = this.resultClassifier.classifyBatch(
        input.retrievedContent.map((c) => ({
          url: c.url,
          content: c.content,
          title: c.title,
        })),
      );

      // Step 2: Calculate aggregate actionable information score
      const classificationStats =
        this.resultClassifier.getAggregateStats(classifications);

      this.logger.debug(
        `Classification stats: avg actionable score=${classificationStats.averageActionableScore.toFixed(2)}, ` +
          `aggregators=${classificationStats.aggregatorCount}, ` +
          `specific=${classificationStats.specificContentCount}, ` +
          `needsExtraction=${classificationStats.needsExtraction}`,
      );

      // Step 3: Format sources for evaluation
      const sourcesText = this.formatSourcesForEvaluation(
        input.retrievedContent,
      );

      // Step 4: Use retrieval-specific evaluator roles
      const evaluatorResults = await this.panelEvaluator.evaluateWithPanel(
        ['sourceRelevance', 'sourceQuality', 'coverageCompleteness'],
        {
          query: input.query,
          plan: {}, // Not used for retrieval
          sources: sourcesText,
        },
      );

      // Step 5: Add actionableInformation score from classifier
      const aggregated = this.scoreAggregator.aggregateScores(evaluatorResults);
      aggregated.scores.actionableInformation =
        classificationStats.averageActionableScore;

      const overallScore = this.scoreAggregator.calculateOverallScore(
        aggregated.scores,
        this.RETRIEVAL_WEIGHTS,
      );

      const passed = overallScore >= this.SEVERE_THRESHOLD;
      const flaggedSevere = overallScore < this.SEVERE_THRESHOLD;

      if (flaggedSevere) {
        this.logger.warn(
          `Retrieval flagged as severe failure: ${overallScore.toFixed(2)}`,
        );
      }

      // Step 6: Check if extraction is needed
      const needsExtraction = classificationStats.needsExtraction;
      let extractionReason: string | undefined;

      if (needsExtraction) {
        extractionReason =
          `Retrieved content is mostly aggregator pages (${classificationStats.aggregatorCount}/${input.retrievedContent.length}). ` +
          `Average actionable score: ${classificationStats.averageActionableScore.toFixed(2)} < 0.6. ` +
          `Web fetch extraction recommended to get specific content.`;
        this.logger.warn(extractionReason);
      }

      // Step 7: Extract explanations from evaluator results
      const explanations: Record<string, string> = {};
      for (const result of evaluatorResults) {
        if (result.explanation) {
          for (const dimension of result.dimensions) {
            explanations[dimension] = result.explanation;
          }
        }
      }

      // Add actionableInformation explanation
      if (needsExtraction) {
        explanations.actionableInformation =
          `Results classified as aggregator pages with low actionable content. ` +
          `${classificationStats.aggregatorCount} aggregators, ${classificationStats.specificContentCount} specific content.`;
      }

      return {
        passed,
        scores: aggregated.scores as RetrievalDimensionScores,
        explanations,
        confidence: aggregated.confidence,
        flaggedSevere,
        sourceDetails: this.buildSourceDetails(
          input.retrievedContent,
          evaluatorResults,
          classifications,
        ),
        evaluationSkipped: false,
        needsExtraction,
        extractionReason,
      };
    } catch (error) {
      this.logger.error(`Retrieval evaluation failed: ${error.message}`);
      return {
        passed: true, // Fail-safe: don't block on evaluation failure
        scores: {
          contextRecall: 0,
          contextPrecision: 0,
          sourceQuality: 0,
          actionableInformation: 0,
        },
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
    return content
      .map((source, index) => {
        return `
### Source ${index + 1}
- URL: ${source.url}
- Title: ${source.title || 'N/A'}
- Content Preview: ${source.content.substring(0, 300)}...
- Fetched At: ${source.fetchedAt ? source.fetchedAt.toISOString() : 'N/A'}
`;
      })
      .join('\n');
  }

  private buildSourceDetails(
    content: RetrievalContent[],
    evaluatorResults: any[],
    classifications: any[],
  ): Array<{
    url: string;
    relevanceScore: number;
    qualityScore: number;
    resultType?: ResultType;
    actionableScore?: number;
  }> {
    // Extract relevance and quality scores from evaluator results
    const relevanceResult = evaluatorResults.find(
      (r) => r.role === 'sourceRelevance',
    );
    const qualityResult = evaluatorResults.find(
      (r) => r.role === 'sourceQuality',
    );

    const contextRecall = relevanceResult?.scores?.contextRecall || 0.5;
    const contextPrecision = relevanceResult?.scores?.contextPrecision || 0.5;
    const sourceQuality = qualityResult?.scores?.sourceQuality || 0.5;

    // Build per-source details with classification information
    return content.map((c, index) => ({
      url: c.url,
      relevanceScore: (contextRecall + contextPrecision) / 2,
      qualityScore: sourceQuality,
      resultType: classifications[index]?.type,
      actionableScore: classifications[index]?.actionableInformationScore,
    }));
  }
}
