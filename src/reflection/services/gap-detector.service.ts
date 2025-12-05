import { Injectable } from '@nestjs/common';
import { LLMService } from '../../llm/llm.service';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import { Gap } from '../interfaces/gap.interface';
import { Claim } from '../../evaluation/interfaces/claim.interface';
import { ClaimConfidence } from '../../evaluation/interfaces/confidence.interface';
import { EntailmentResult } from '../../evaluation/interfaces/entailment.interface';
import { v4 as uuidv4 } from 'uuid';

interface Source {
  id?: string;
  url: string;
  content: string;
  title?: string;
  relevance?: string;
}

interface LLMGapResponse {
  description: string;
  severity: 'critical' | 'major' | 'minor';
  suggestedAction: string;
}

@Injectable()
export class GapDetectorService {
  constructor(
    private readonly llmService: LLMService,
    private readonly eventCoordinator: EventCoordinatorService,
    private readonly researchLogger: ResearchLogger,
  ) {}

  async detectGaps(
    answer: string,
    sources: Source[],
    claims: Claim[],
    claimConfidences: ClaimConfidence[],
    entailmentResults: EntailmentResult[],
    query: string,
    logId?: string,
  ): Promise<Gap[]> {
    const startTime = Date.now();
    const gaps: Gap[] = [];

    try {
      // Emit gap detection started event
      if (logId) {
        await this.eventCoordinator.emit(
          logId,
          'gap_detection_started',
          {
            query,
            claimsCount: claims.length,
            sourcesCount: sources.length,
          },
        );
      }

      this.researchLogger.log(logId || 'unknown', 'gap-detector', 'detect-gaps-start', {
        query,
        claimsCount: claims.length,
        sourcesCount: sources.length,
      });

      // 1. Detect weak claims (confidence < 0.5)
      const weakClaimGaps = await this.detectWeakClaims(
        claimConfidences,
        claims,
        logId,
      );
      gaps.push(...weakClaimGaps);

      // 2. Detect missing information using LLM
      const missingInfoGaps = await this.detectMissingInformation(
        answer,
        sources,
        query,
        logId,
      );
      gaps.push(...missingInfoGaps);

      // 3. Detect claims without supporting sources
      const sourceCoverageGaps = await this.detectSourceCoverageGaps(
        claims,
        claimConfidences,
        entailmentResults,
        logId,
      );
      gaps.push(...sourceCoverageGaps);

      // 4. Detect contradictions
      const contradictionGaps = await this.detectContradictions(
        claims,
        entailmentResults,
        logId,
      );
      gaps.push(...contradictionGaps);

      // 5. Query coverage is handled by missing information detection

      const durationMs = Date.now() - startTime;
      const criticalGapsCount = gaps.filter((g) => g.severity === 'critical').length;

      this.researchLogger.log(logId || 'unknown', 'gap-detector', 'detect-gaps-complete', {
        totalGaps: gaps.length,
        criticalGaps: criticalGapsCount,
        durationMs,
      });

      // Emit gap detection completed event
      if (logId) {
        await this.eventCoordinator.emit(
          logId,
          'gap_detection_completed',
          {
            totalGaps: gaps.length,
            criticalGaps: criticalGapsCount,
            gapTypes: this.aggregateGapTypes(gaps),
            durationMs,
          },
        );
      }

      return gaps;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.researchLogger.logStageError(0, logId || 'unknown', error);

      if (logId) {
        await this.eventCoordinator.emit(
          logId,
          'gap_detection_completed',
          {
            error: error.message,
            durationMs,
          },
        );
      }

      throw error;
    }
  }

  /**
   * Detect weak claims with confidence < 0.5
   */
  private async detectWeakClaims(
    claimConfidences: ClaimConfidence[],
    claims: Claim[],
    logId?: string,
  ): Promise<Gap[]> {
    const gaps: Gap[] = [];
    const weakThreshold = 0.5;

    for (const claimConfidence of claimConfidences) {
      if (claimConfidence.confidence < weakThreshold) {
        const relatedClaim = claims.find((c) => c.id === claimConfidence.claimId);
        const gap: Gap = {
          id: uuidv4(),
          type: 'weak_claim',
          severity: 'major',
          description: `Claim has low confidence (${(claimConfidence.confidence * 100).toFixed(1)}%): "${claimConfidence.claimText.substring(0, 100)}..."`,
          suggestedAction: `Find additional sources to support this claim or rephrase with appropriate uncertainty qualifiers`,
          relatedClaim,
          confidence: claimConfidence.confidence,
        };

        gaps.push(gap);

        if (logId) {
          await this.eventCoordinator.emit(
            logId,
            'gap_detected',
            {
              gapId: gap.id,
              type: gap.type,
              severity: gap.severity,
              claimId: claimConfidence.claimId,
              confidence: claimConfidence.confidence,
            },
          );
        }
      }
    }

    return gaps;
  }

  /**
   * Use LLM to detect missing information and incomplete query coverage
   */
  private async detectMissingInformation(
    answer: string,
    sources: Source[],
    query: string,
    logId?: string,
  ): Promise<Gap[]> {
    try {
      const sourceTitles = sources.map((s) => s.title || s.url).slice(0, 10);

      const prompt = `Query: "${query}"

Answer: "${answer}"

Sources: ${sourceTitles.join(', ')}

Analyze whether this answer fully addresses the query. Identify:
1. What specific aspects of the query are not addressed?
2. What additional context would make the answer more complete?
3. What important nuances or details are missing?
4. Are there contradictions or ambiguities that need clarification?

For each gap, specify:
- description (1-2 sentences, max 150 characters)
- severity: critical/major/minor
- suggestedAction (1 sentence, max 150 characters)

Output ONLY a valid JSON array with this exact structure:
[{"description": "...", "severity": "major", "suggestedAction": "..."}]

If no gaps exist, output: []`;

      const response = await this.llmService.chat([
        {
          role: 'system',
          content: 'You are an expert research analyst identifying gaps in research answers. Respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const content = response.message.content.trim();
      const llmGaps = this.parseLLMGapResponse(content);

      const gaps: Gap[] = llmGaps.map((llmGap) => ({
        id: uuidv4(),
        type: 'missing_info',
        severity: llmGap.severity,
        description: llmGap.description,
        suggestedAction: llmGap.suggestedAction,
        confidence: 0.7, // LLM-detected gaps have moderate confidence
      }));

      for (const gap of gaps) {
        if (logId) {
          await this.eventCoordinator.emit(
            logId,
            'gap_detected',
            {
              gapId: gap.id,
              type: gap.type,
              severity: gap.severity,
              description: gap.description,
            },
          );
        }
      }

      return gaps;
    } catch (error) {
      this.researchLogger.log(logId || 'unknown', 'gap-detector', 'llm-gap-detection-error', {
        error: error.message,
      });
      // Return empty array on error - don't fail gap detection
      return [];
    }
  }

  /**
   * Parse LLM response into structured gap objects
   */
  private parseLLMGapResponse(content: string): LLMGapResponse[] {
    try {
      // Remove markdown code blocks if present
      const cleanedContent = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(cleanedContent);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            item.description &&
            item.severity &&
            item.suggestedAction,
        )
        .map((item) => ({
          description: String(item.description).substring(0, 200),
          severity: this.normalizeSeverity(item.severity),
          suggestedAction: String(item.suggestedAction).substring(0, 200),
        }));
    } catch (error) {
      // Failed to parse - return empty array
      return [];
    }
  }

  /**
   * Normalize severity values from LLM
   */
  private normalizeSeverity(
    severity: string,
  ): 'critical' | 'major' | 'minor' {
    const normalized = severity.toLowerCase();
    if (normalized === 'critical') return 'critical';
    if (normalized === 'major' || normalized === 'high') return 'major';
    return 'minor';
  }

  /**
   * Detect claims without supporting sources
   */
  private async detectSourceCoverageGaps(
    claims: Claim[],
    claimConfidences: ClaimConfidence[],
    entailmentResults: EntailmentResult[],
    logId?: string,
  ): Promise<Gap[]> {
    const gaps: Gap[] = [];

    for (const claim of claims) {
      // Check ClaimConfidence supportingSources
      const claimConfidence = claimConfidences.find((cc) => cc.claimId === claim.id);
      const supportingSourcesCount = claimConfidence?.supportingSources || 0;

      // Also check entailment results
      const entailment = entailmentResults.find((er) => er.claim.id === claim.id);
      const hasEntailmentSupport = entailment && entailment.supportingSources.length > 0;

      if (supportingSourcesCount === 0 && !hasEntailmentSupport) {
        const gap: Gap = {
          id: uuidv4(),
          type: 'incomplete_coverage',
          severity: 'critical',
          description: `Claim lacks supporting sources: "${claim.text.substring(0, 100)}..."`,
          suggestedAction: `Search for credible sources that support this claim or remove it from the answer`,
          relatedClaim: claim,
          confidence: 0.95, // High confidence that this is a real gap
        };

        gaps.push(gap);

        if (logId) {
          await this.eventCoordinator.emit(
            logId,
            'gap_detected',
            {
              gapId: gap.id,
              type: gap.type,
              severity: gap.severity,
              claimId: claim.id,
            },
          );
        }
      }
    }

    return gaps;
  }

  /**
   * Detect contradictions between claims and sources
   */
  private async detectContradictions(
    claims: Claim[],
    entailmentResults: EntailmentResult[],
    logId?: string,
  ): Promise<Gap[]> {
    const gaps: Gap[] = [];

    for (const entailment of entailmentResults) {
      if (entailment.verdict === 'contradicted') {
        const relatedClaim = claims.find((c) => c.id === entailment.claim.id);

        const contradictingSources = entailment.contradictingSources
          .map((cs) => cs.sourceUrl)
          .join(', ');

        const gap: Gap = {
          id: uuidv4(),
          type: 'contradiction',
          severity: 'critical',
          description: `Claim contradicted by sources: "${entailment.claim.text.substring(0, 100)}..."`,
          suggestedAction: `Review contradicting sources (${contradictingSources}) and revise or remove this claim`,
          relatedClaim,
          confidence: 0.9, // High confidence in contradiction detection
        };

        gaps.push(gap);

        if (logId) {
          await this.eventCoordinator.emit(
            logId,
            'gap_detected',
            {
              gapId: gap.id,
              type: gap.type,
              severity: gap.severity,
              claimId: entailment.claim.id,
              contradictingSources: entailment.contradictingSources.length,
            },
          );
        }
      }
    }

    return gaps;
  }

  /**
   * Aggregate gap types for summary reporting
   */
  private aggregateGapTypes(gaps: Gap[]): Record<string, number> {
    const aggregated: Record<string, number> = {
      missing_info: 0,
      weak_claim: 0,
      contradiction: 0,
      incomplete_coverage: 0,
    };

    for (const gap of gaps) {
      aggregated[gap.type]++;
    }

    return aggregated;
  }
}
