import { Injectable, Logger } from '@nestjs/common';
import { Claim } from '../interfaces/claim.interface';
import { EntailmentResult } from '../interfaces/entailment.interface';
import { SUScoreResult } from '../interfaces/confidence.interface';
import {
  ConfidenceResult,
  ClaimConfidence,
  ConfidenceMethodology,
} from '../interfaces/confidence.interface';

@Injectable()
export class ConfidenceAggregatorService {
  private readonly logger = new Logger(ConfidenceAggregatorService.name);

  // Default weights for confidence calculation
  private readonly DEFAULT_WEIGHTS: ConfidenceMethodology = {
    entailmentWeight: 0.5,
    suScoreWeight: 0.3,
    sourceCountWeight: 0.2,
  };

  /**
   * Aggregate entailment scores, SU scores, and source counts into final confidence scores
   */
  aggregateConfidence(
    claims: Claim[],
    entailmentResults: EntailmentResult[],
    suScoreResult: SUScoreResult,
    totalSourceCount: number,
    weights?: Partial<ConfidenceMethodology>,
  ): ConfidenceResult {
    this.logger.debug(`Aggregating confidence for ${claims.length} claims`);

    // Merge custom weights with defaults
    const methodology: ConfidenceMethodology = {
      ...this.DEFAULT_WEIGHTS,
      ...weights,
    };

    // Calculate confidence for each claim
    const claimConfidences: ClaimConfidence[] = claims.map((claim, index) => {
      const entailment = entailmentResults[index];
      const suScore = suScoreResult.claimScores.find(s => s.claimId === claim.id);

      return this.calculateClaimConfidence(
        claim,
        entailment,
        suScore?.score || 0.5,
        totalSourceCount,
        methodology,
      );
    });

    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence(claimConfidences);
    const level = this.getConfidenceLevel(overallConfidence);

    // Generate recommendations based on confidence
    const recommendations = this.generateRecommendations(
      overallConfidence,
      claimConfidences,
      totalSourceCount,
    );

    this.logger.debug(`Overall confidence: ${overallConfidence.toFixed(3)} (${level})`);

    return {
      overallConfidence,
      level,
      claimConfidences,
      methodology,
      recommendations,
    };
  }

  private calculateClaimConfidence(
    claim: Claim,
    entailment: EntailmentResult,
    suScore: number,
    totalSourceCount: number,
    methodology: ConfidenceMethodology,
  ): ClaimConfidence {
    // Normalize entailment score based on verdict
    const entailmentScore = this.normalizeEntailmentScore(entailment);

    // Normalize source count (assume 5+ sources is ideal)
    const sourceCountScore = Math.min(1.0, totalSourceCount / 5);

    // Calculate weighted confidence
    const confidence =
      entailmentScore * methodology.entailmentWeight +
      suScore * methodology.suScoreWeight +
      sourceCountScore * methodology.sourceCountWeight;

    const clampedConfidence = Math.max(0, Math.min(1, confidence));
    const level = this.getConfidenceLevel(clampedConfidence);

    return {
      claimId: claim.id,
      claimText: claim.text,
      confidence: clampedConfidence,
      level,
      entailmentScore,
      suScore,
      supportingSources: entailment.supportingSources.length,
    };
  }

  private normalizeEntailmentScore(entailment: EntailmentResult): number {
    switch (entailment.verdict) {
      case 'entailed':
        // High confidence for entailed claims
        return 0.7 + (entailment.score * 0.3);
      case 'contradicted':
        // Low confidence for contradicted claims
        return 0.1 + ((1 - entailment.score) * 0.2);
      case 'neutral':
      default:
        // Medium confidence for neutral claims
        return 0.4 + (entailment.score * 0.2);
    }
  }

  private calculateOverallConfidence(claimConfidences: ClaimConfidence[]): number {
    if (claimConfidences.length === 0) {
      return 0.5; // Neutral confidence if no claims
    }

    // Use weighted average, giving more weight to lower confidences
    // This is conservative - overall confidence is pulled down by low-confidence claims
    const sortedConfidences = [...claimConfidences]
      .map(c => c.confidence)
      .sort((a, b) => a - b);

    let weightedSum = 0;
    let totalWeight = 0;

    sortedConfidences.forEach((conf, index) => {
      // Lower-confidence claims get higher weight
      const weight = claimConfidences.length - index;
      weightedSum += conf * weight;
      totalWeight += weight;
    });

    return weightedSum / totalWeight;
  }

  private getConfidenceLevel(
    score: number,
  ): 'high' | 'medium' | 'low' | 'very_low' {
    if (score >= 0.8) return 'high';
    if (score >= 0.6) return 'medium';
    if (score >= 0.4) return 'low';
    return 'very_low';
  }

  private generateRecommendations(
    overallConfidence: number,
    claimConfidences: ClaimConfidence[],
    totalSourceCount: number,
  ): string[] {
    const recommendations: string[] = [];

    // Overall confidence recommendations
    if (overallConfidence < 0.6) {
      recommendations.push(
        'Overall confidence is below 60%. Consider gathering additional sources or verifying key claims.',
      );
    }

    // Source count recommendations
    if (totalSourceCount < 3) {
      recommendations.push(
        `Only ${totalSourceCount} source(s) used. Consider adding more sources for better confidence.`,
      );
    }

    // Low-confidence claim recommendations
    const lowConfidenceClaims = claimConfidences.filter(c => c.confidence < 0.5);
    if (lowConfidenceClaims.length > 0) {
      recommendations.push(
        `${lowConfidenceClaims.length} claim(s) have low confidence (<50%). Review and verify these claims.`,
      );
    }

    // Contradicted claims
    const contradictedClaims = claimConfidences.filter(c => c.entailmentScore < 0.3);
    if (contradictedClaims.length > 0) {
      recommendations.push(
        `${contradictedClaims.length} claim(s) may be contradicted by sources. Review for accuracy.`,
      );
    }

    // Unsupported claims
    const unsupportedClaims = claimConfidences.filter(c => c.supportingSources === 0);
    if (unsupportedClaims.length > 0) {
      recommendations.push(
        `${unsupportedClaims.length} claim(s) lack supporting sources. Consider adding citations or removing unsupported claims.`,
      );
    }

    // SU Score recommendations
    const lowSUClaims = claimConfidences.filter(c => c.suScore < 0.5);
    if (lowSUClaims.length > 0) {
      recommendations.push(
        `${lowSUClaims.length} claim(s) have high substantive-word uncertainty. Verify key terms and facts.`,
      );
    }

    // Positive feedback
    if (overallConfidence >= 0.8 && recommendations.length === 0) {
      recommendations.push(
        'High confidence score. The answer is well-supported by sources with low uncertainty.',
      );
    }

    return recommendations;
  }
}
