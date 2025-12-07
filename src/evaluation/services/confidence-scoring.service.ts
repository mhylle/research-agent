import { Injectable, Logger } from '@nestjs/common';
import { ClaimExtractorService } from './claim-extractor.service';
import { EntailmentCheckerService } from './entailment-checker.service';
import { SUScoreCalculatorService } from './suscore-calculator.service';
import { ConfidenceAggregatorService } from './confidence-aggregator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import {
  ConfidenceResult,
  ConfidenceMethodology,
} from '../interfaces/confidence.interface';
import { Claim } from '../interfaces/claim.interface';
import { EntailmentResult } from '../interfaces/entailment.interface';

interface Source {
  id: string;
  url: string;
  content: string;
  title?: string;
  relevance?: number;
}

@Injectable()
export class ConfidenceScoringService {
  private readonly logger = new Logger(ConfidenceScoringService.name);

  constructor(
    private readonly claimExtractor: ClaimExtractorService,
    private readonly entailmentChecker: EntailmentCheckerService,
    private readonly suScoreCalculator: SUScoreCalculatorService,
    private readonly confidenceAggregator: ConfidenceAggregatorService,
    private readonly researchLogger: ResearchLogger,
  ) {}

  /**
   * Execute the full confidence scoring pipeline
   * @param answerText - The generated answer text to evaluate
   * @param sources - The sources used to generate the answer
   * @param logId - Optional log ID for tracking
   * @param customWeights - Optional custom weights for confidence calculation
   */
  async scoreConfidence(
    answerText: string,
    sources: Source[],
    logId?: string,
    customWeights?: Partial<ConfidenceMethodology>,
  ): Promise<ConfidenceResult> {
    const startTime = Date.now();
    this.logger.log(
      `Starting confidence scoring pipeline for answer (${answerText.length} chars) with ${sources.length} sources`,
    );

    if (logId) {
      this.researchLogger.nodeStart(
        'confidence-scoring',
        logId,
        'stage',
        'evaluation',
      );
    }

    try {
      // Step 1: Extract claims from answer
      this.logger.debug('Step 1: Extracting claims...');
      const claims = await this.extractClaimsWithLogging(answerText, logId);

      if (claims.length === 0) {
        this.logger.warn('No claims extracted from answer');
        return this.createLowConfidenceResult(
          'No claims could be extracted from the answer',
        );
      }

      // Step 2: Check entailment for each claim
      this.logger.debug('Step 2: Checking entailment...');
      const entailmentResults = await this.checkEntailmentWithLogging(
        claims,
        sources,
        logId,
      );

      // Step 3: Calculate SU Scores
      this.logger.debug('Step 3: Calculating SU Scores...');
      const suScoreResult = await this.calculateSUScoresWithLogging(
        claims,
        entailmentResults,
        logId,
      );

      // Step 4: Aggregate confidence scores
      this.logger.debug('Step 4: Aggregating confidence scores...');
      const confidenceResult = await this.aggregateConfidenceWithLogging(
        claims,
        entailmentResults,
        suScoreResult,
        sources.length,
        customWeights,
        logId,
      );

      const executionTime = Date.now() - startTime;
      this.logger.log(
        `Confidence scoring completed in ${executionTime}ms. Overall confidence: ${confidenceResult.overallConfidence.toFixed(3)} (${confidenceResult.level})`,
      );

      if (logId) {
        this.researchLogger.nodeComplete('confidence-scoring', logId, {
          confidence: confidenceResult.overallConfidence,
          level: confidenceResult.level,
          claimCount: claims.length,
          executionTime,
        });
      }

      return confidenceResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(
        `Confidence scoring failed after ${executionTime}ms: ${error.message}`,
      );

      if (logId) {
        this.researchLogger.nodeError('confidence-scoring', logId, error);
      }

      throw new Error(`Confidence scoring pipeline failed: ${error.message}`);
    }
  }

  private async extractClaimsWithLogging(
    answerText: string,
    logId?: string,
  ): Promise<Claim[]> {
    const startTime = Date.now();

    if (logId) {
      this.researchLogger.nodeStart(
        'extract-claims',
        logId,
        'tool',
        'confidence-scoring',
      );
    }

    try {
      const claims = await this.claimExtractor.extractClaims(answerText);
      const executionTime = Date.now() - startTime;

      if (logId) {
        this.researchLogger.nodeComplete('extract-claims', logId, {
          claimCount: claims.length,
          executionTime,
        });
      }

      return claims;
    } catch (error) {
      if (logId) {
        this.researchLogger.nodeError('extract-claims', logId, error);
      }
      throw error;
    }
  }

  private async checkEntailmentWithLogging(
    claims: Claim[],
    sources: Source[],
    logId?: string,
  ): Promise<EntailmentResult[]> {
    const startTime = Date.now();

    if (logId) {
      this.researchLogger.nodeStart(
        'check-entailment',
        logId,
        'tool',
        'confidence-scoring',
      );
    }

    try {
      const results: EntailmentResult[] = [];

      for (const claim of claims) {
        const result = await this.entailmentChecker.checkEntailment(
          claim,
          sources,
        );
        result.claim = claim; // Ensure claim is set
        results.push(result);

        if (logId) {
          this.researchLogger.nodeProgress('check-entailment', logId, {
            processed: results.length,
            total: claims.length,
            currentClaim: claim.text.substring(0, 50),
            verdict: result.verdict,
          });
        }
      }

      const executionTime = Date.now() - startTime;

      if (logId) {
        this.researchLogger.nodeComplete('check-entailment', logId, {
          claimCount: results.length,
          executionTime,
          verdicts: {
            entailed: results.filter((r) => r.verdict === 'entailed').length,
            neutral: results.filter((r) => r.verdict === 'neutral').length,
            contradicted: results.filter((r) => r.verdict === 'contradicted')
              .length,
          },
        });
      }

      return results;
    } catch (error) {
      if (logId) {
        this.researchLogger.nodeError('check-entailment', logId, error);
      }
      throw error;
    }
  }

  private async calculateSUScoresWithLogging(
    claims: Claim[],
    entailmentResults: EntailmentResult[],
    logId?: string,
  ) {
    const startTime = Date.now();

    if (logId) {
      this.researchLogger.nodeStart(
        'calculate-su-scores',
        logId,
        'tool',
        'confidence-scoring',
      );
    }

    try {
      const suScoreResult = this.suScoreCalculator.calculateSUScore(
        claims,
        entailmentResults,
      );
      const executionTime = Date.now() - startTime;

      if (logId) {
        this.researchLogger.nodeComplete('calculate-su-scores', logId, {
          overallScore: suScoreResult.overallScore,
          claimCount: suScoreResult.claimScores.length,
          executionTime,
        });
      }

      return suScoreResult;
    } catch (error) {
      if (logId) {
        this.researchLogger.nodeError('calculate-su-scores', logId, error);
      }
      throw error;
    }
  }

  private async aggregateConfidenceWithLogging(
    claims: Claim[],
    entailmentResults: EntailmentResult[],
    suScoreResult: any,
    sourceCount: number,
    customWeights?: Partial<ConfidenceMethodology>,
    logId?: string,
  ): Promise<ConfidenceResult> {
    const startTime = Date.now();

    if (logId) {
      this.researchLogger.nodeStart(
        'aggregate-confidence',
        logId,
        'tool',
        'confidence-scoring',
      );
    }

    try {
      const confidenceResult = this.confidenceAggregator.aggregateConfidence(
        claims,
        entailmentResults,
        suScoreResult,
        sourceCount,
        customWeights,
      );

      const executionTime = Date.now() - startTime;

      if (logId) {
        this.researchLogger.nodeComplete('aggregate-confidence', logId, {
          overallConfidence: confidenceResult.overallConfidence,
          level: confidenceResult.level,
          recommendations: confidenceResult.recommendations.length,
          executionTime,
        });
      }

      return confidenceResult;
    } catch (error) {
      if (logId) {
        this.researchLogger.nodeError('aggregate-confidence', logId, error);
      }
      throw error;
    }
  }

  private createLowConfidenceResult(reason: string): ConfidenceResult {
    return {
      overallConfidence: 0.1,
      level: 'very_low',
      claimConfidences: [],
      methodology: {
        entailmentWeight: 0.5,
        suScoreWeight: 0.3,
        sourceCountWeight: 0.2,
      },
      recommendations: [reason, 'Unable to perform confidence assessment.'],
    };
  }
}
