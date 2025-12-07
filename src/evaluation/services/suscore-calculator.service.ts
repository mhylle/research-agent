import { Injectable, Logger } from '@nestjs/common';
import { Claim } from '../interfaces/claim.interface';
import { EntailmentResult } from '../interfaces/entailment.interface';
import {
  SUScoreResult,
  ClaimSUScore,
  WordUncertainty,
} from '../interfaces/confidence.interface';

@Injectable()
export class SUScoreCalculatorService {
  private readonly logger = new Logger(SUScoreCalculatorService.name);

  // Word type importance weights
  private readonly WORD_WEIGHTS = {
    proper_noun: 1.0,
    numeral: 0.95,
    noun: 0.8,
    verb: 0.7,
  };

  /**
   * Calculate Substantive-word Uncertainty Score for claims
   * Formula: SUScore = 1 - (Σ(importance × uncertainty) / Σ(importance))
   */
  calculateSUScore(
    claims: Claim[],
    entailmentResults: EntailmentResult[],
  ): SUScoreResult {
    this.logger.debug(`Calculating SU Score for ${claims.length} claims`);

    const claimScores: ClaimSUScore[] = [];
    let totalWeightedUncertainty = 0;
    let totalImportance = 0;

    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      const entailment = entailmentResults[i];

      const claimScore = this.calculateClaimSUScore(claim, entailment);
      claimScores.push(claimScore);

      // Accumulate for overall score
      const claimImportance = this.calculateClaimImportance(claim);
      totalWeightedUncertainty += (1 - claimScore.score) * claimImportance;
      totalImportance += claimImportance;
    }

    // Calculate overall SU Score
    const overallScore =
      totalImportance > 0
        ? 1 - totalWeightedUncertainty / totalImportance
        : 0.5; // Default to neutral if no importance

    this.logger.debug(`Overall SU Score: ${overallScore.toFixed(3)}`);

    return {
      overallScore: this.clampScore(overallScore),
      claimScores,
      methodology: this.getMethodologyDescription(),
    };
  }

  private calculateClaimSUScore(
    claim: Claim,
    entailment: EntailmentResult,
  ): ClaimSUScore {
    const wordBreakdown: WordUncertainty[] = [];
    let totalImportance = 0;
    let weightedUncertainty = 0;

    for (const word of claim.substantiveWords) {
      // Calculate importance based on word type
      const importance = this.WORD_WEIGHTS[word.type] || 0.5;

      // Calculate uncertainty based on entailment result
      const uncertainty = this.calculateWordUncertainty(word, entailment);

      // Calculate contribution to overall uncertainty
      const contribution = importance * uncertainty;

      wordBreakdown.push({
        word: word.word,
        importance,
        uncertainty,
        contribution,
      });

      totalImportance += importance;
      weightedUncertainty += contribution;
    }

    // Handle claims with no substantive words
    if (totalImportance === 0) {
      this.logger.warn(
        `Claim has no substantive words: ${claim.text.substring(0, 50)}...`,
      );
      return {
        claimId: claim.id,
        score: 0.5, // Neutral score
        wordBreakdown: [],
      };
    }

    // Calculate claim SU Score: higher score = more confidence (less uncertainty)
    const score = 1 - weightedUncertainty / totalImportance;

    return {
      claimId: claim.id,
      score: this.clampScore(score),
      wordBreakdown,
    };
  }

  private calculateClaimImportance(claim: Claim): number {
    // Importance is sum of all substantive word importances
    return claim.substantiveWords.reduce((sum, word) => {
      return sum + (this.WORD_WEIGHTS[word.type] || 0.5);
    }, 0);
  }

  private calculateWordUncertainty(
    word: any,
    entailment: EntailmentResult,
  ): number {
    // Base uncertainty on entailment verdict
    let baseUncertainty: number;

    switch (entailment.verdict) {
      case 'entailed':
        // Low uncertainty for entailed claims
        baseUncertainty = 0.1 + (1 - entailment.score) * 0.2;
        break;
      case 'contradicted':
        // High uncertainty for contradicted claims
        baseUncertainty = 0.8 + (1 - entailment.score) * 0.2;
        break;
      case 'neutral':
      default:
        // Medium uncertainty for neutral claims
        baseUncertainty = 0.5;
        break;
    }

    // Adjust based on word type - more important words contribute more to uncertainty
    const typeMultiplier = this.WORD_WEIGHTS[word.type] || 0.5;
    const adjustedUncertainty = baseUncertainty * typeMultiplier;

    return this.clampScore(adjustedUncertainty);
  }

  private clampScore(score: number): number {
    return Math.max(0, Math.min(1, score));
  }

  private getMethodologyDescription(): string {
    return `Substantive-word Uncertainty Score (SU Score) methodology:
- Formula: SUScore = 1 - (Σ(importance × uncertainty) / Σ(importance))
- Word type weights: proper_noun=1.0, numeral=0.95, noun=0.8, verb=0.7
- Uncertainty based on entailment: entailed=0.1-0.3, neutral=0.5, contradicted=0.8-1.0
- Higher score indicates higher confidence (lower uncertainty)`;
  }
}
