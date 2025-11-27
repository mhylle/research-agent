import { Injectable } from '@nestjs/common';
import { EvaluatorResult, DimensionScores } from '../interfaces';

export interface AggregatedResult {
  scores: DimensionScores;
  confidence: number;
}

@Injectable()
export class ScoreAggregatorService {
  private readonly PLAN_DIMENSION_WEIGHTS: Record<string, number> = {
    intentAlignment: 0.50,
    queryCoverage: 0.35,
    scopeAppropriateness: 0.15,
  };

  aggregateScores(results: EvaluatorResult[]): AggregatedResult {
    const scores: DimensionScores = {};
    let totalConfidence = 0;
    let confidenceCount = 0;

    // Collect all scores with confidence weighting
    for (const result of results) {
      for (const [dimension, score] of Object.entries(result.scores)) {
        if (typeof score === 'number') {
          // Weight by confidence
          scores[dimension] = score; // For now, just take the value
        }
      }
      totalConfidence += result.confidence;
      confidenceCount++;
    }

    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return {
      scores,
      confidence: avgConfidence,
    };
  }

  calculateOverallScore(scores: DimensionScores, weights?: Record<string, number>): number {
    const w = weights || this.PLAN_DIMENSION_WEIGHTS;
    let weightedSum = 0;
    let totalWeight = 0;

    // If custom weights provided, use them
    if (weights) {
      for (const [dimension, weight] of Object.entries(w)) {
        if (dimension in scores) {
          weightedSum += scores[dimension] * weight;
          totalWeight += weight;
        }
      }
    } else {
      // No weights provided - check if scores match default weights
      const hasWeightedDimensions = Object.keys(scores).some(d => d in this.PLAN_DIMENSION_WEIGHTS);

      if (hasWeightedDimensions) {
        // Use weighted calculation for known dimensions
        for (const [dimension, weight] of Object.entries(this.PLAN_DIMENSION_WEIGHTS)) {
          if (dimension in scores) {
            weightedSum += scores[dimension] * weight;
            totalWeight += weight;
          }
        }
      } else {
        // Unknown dimensions - use simple average
        const scoreValues = Object.values(scores).filter(v => typeof v === 'number');
        if (scoreValues.length > 0) {
          return scoreValues.reduce((sum, val) => sum + val, 0) / scoreValues.length;
        }
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  checkEscalationTriggers(
    aggregated: AggregatedResult,
    results: EvaluatorResult[],
    passThreshold: number = 0.7,
  ): 'low_confidence' | 'disagreement' | 'borderline' | null {
    // Check low confidence
    const allLowConfidence = results.length > 0 &&
      results.every(r => r.confidence < 0.6);
    if (allLowConfidence || aggregated.confidence < 0.6) {
      return 'low_confidence';
    }

    // Check disagreement (scores differ by > 0.3)
    for (const dimension of Object.keys(aggregated.scores)) {
      const dimensionScores = results
        .map(r => r.scores[dimension])
        .filter(s => typeof s === 'number');

      if (dimensionScores.length >= 2) {
        const max = Math.max(...dimensionScores);
        const min = Math.min(...dimensionScores);
        if (max - min > 0.3) {
          return 'disagreement';
        }
      }
    }

    // Check borderline (within 0.05 of threshold)
    const overallScore = this.calculateOverallScore(aggregated.scores);
    if (Math.abs(overallScore - passThreshold) < 0.05) {
      return 'borderline';
    }

    return null;
  }
}
