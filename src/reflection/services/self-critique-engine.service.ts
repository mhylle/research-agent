import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from '../../llm/ollama.service';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import { ConfidenceResult } from '../../evaluation/interfaces/confidence.interface';
import { Gap } from '../interfaces/gap.interface';
import { SelfCritique } from '../interfaces/self-critique.interface';

interface Source {
  id: string;
  url: string;
  content: string;
  title?: string;
}

@Injectable()
export class SelfCritiqueEngineService {
  private readonly logger = new Logger(SelfCritiqueEngineService.name);

  constructor(
    private readonly llmService: OllamaService,
    private readonly eventCoordinator: EventCoordinatorService,
    private readonly researchLogger: ResearchLogger,
  ) {}

  /**
   * Generate a structured self-critique of the synthesized research answer
   * @param answer - The generated answer to critique
   * @param sources - The sources used to generate the answer
   * @param query - The original research query
   * @param confidenceResult - The confidence scoring result
   * @param gaps - Identified knowledge gaps
   * @param logId - Optional log ID for tracking
   * @returns A structured self-critique with confidence score
   */
  async critiqueSynthesis(
    answer: string,
    sources: Source[],
    query: string,
    confidenceResult: ConfidenceResult,
    gaps: Gap[],
    logId?: string,
  ): Promise<SelfCritique> {
    const startTime = Date.now();
    this.logger.log(
      `Starting self-critique for answer (${answer.length} chars) with ${sources.length} sources and ${gaps.length} gaps`,
    );

    if (logId) {
      this.researchLogger.nodeStart(
        'self-critique',
        logId,
        'stage',
        'evaluation',
      );
      await this.eventCoordinator.emit(logId, 'self_critique_started', {
        answerLength: answer.length,
        sourceCount: sources.length,
        gapCount: gaps.length,
      });
    }

    try {
      // Build the critique prompt
      const prompt = this.buildCritiquePrompt(
        answer,
        sources,
        query,
        confidenceResult,
        gaps,
      );

      this.logger.debug('Calling LLM for self-critique analysis...');

      // Call LLM for critique
      const response = await this.llmService.chat([
        {
          role: 'system',
          content:
            'You are a critical evaluator of research answers. Analyze objectively and provide structured feedback in valid JSON format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      // Parse the response
      const critique = this.parseCritiqueResponse(response.message.content);

      // Calculate confidence in the critique itself
      critique.confidence = this.calculateCritiqueConfidence(
        critique,
        sources.length,
        gaps.length,
      );

      const executionTime = Date.now() - startTime;
      this.logger.log(
        `Self-critique completed in ${executionTime}ms with confidence ${critique.confidence.toFixed(3)}`,
      );

      if (logId) {
        this.researchLogger.nodeComplete('self-critique', logId, {
          strengthCount: critique.strengths.length,
          weaknessCount: critique.weaknesses.length,
          criticalIssueCount: critique.criticalIssues.length,
          improvementCount: critique.suggestedImprovements.length,
          confidence: critique.confidence,
          executionTime,
        });

        await this.eventCoordinator.emit(logId, 'self_critique_completed', {
          critique,
          executionTime,
        });
      }

      return critique;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(
        `Self-critique failed after ${executionTime}ms: ${error.message}`,
      );

      if (logId) {
        this.researchLogger.nodeError('self-critique', logId, error);
        await this.eventCoordinator.emit(logId, 'self_critique_failed', {
          error: error.message,
          executionTime,
        });
      }

      // Return a minimal critique with low confidence instead of throwing
      return this.createFallbackCritique(error.message);
    }
  }

  /**
   * Build the prompt for LLM-based self-critique
   */
  private buildCritiquePrompt(
    answer: string,
    sources: Source[],
    query: string,
    confidenceResult: ConfidenceResult,
    gaps: Gap[],
  ): string {
    // Format sources for the prompt
    const sourcesText = sources
      .map(
        (s, idx) =>
          `[${idx + 1}] ${s.title || 'Untitled'} (${s.url})\n   ${this.truncate(s.content, 200)}`,
      )
      .join('\n');

    // Format gaps for the prompt
    const gapsText = gaps
      .map(
        (g, idx) =>
          `[${idx + 1}] ${g.severity.toUpperCase()}: ${g.type} - ${g.description}`,
      )
      .join('\n');

    // Format confidence scores
    const confidenceText = `Overall: ${confidenceResult.overallConfidence.toFixed(3)} (${confidenceResult.level})
Claim-level confidences: ${confidenceResult.claimConfidences.length} claims analyzed
Low confidence claims: ${confidenceResult.claimConfidences.filter((c) => c.level === 'low' || c.level === 'very_low').length}`;

    return `You are a critical evaluator of research answers. Analyze this answer objectively and provide structured feedback.

QUERY: "${query}"

ANSWER:
${answer}

SOURCES (${sources.length} total):
${sourcesText || 'No sources available'}

DETECTED GAPS (${gaps.length} total):
${gapsText || 'No gaps detected'}

CONFIDENCE SCORES:
${confidenceText}

Provide a structured critique following these guidelines:

1. STRENGTHS (what is done well):
   - List 2-4 specific strengths
   - Be concrete and reference specific parts of the answer

2. WEAKNESSES (what needs improvement):
   - List 2-4 specific weaknesses with evidence
   - Identify issues that could confuse or mislead readers

3. CRITICAL ISSUES (must be fixed before deployment):
   - List any factual errors
   - Identify missing key information
   - Note any contradictions with sources

4. SUGGESTED IMPROVEMENTS (actionable next steps):
   - Provide specific, prioritized improvements
   - Focus on the most impactful changes first

5. OVERALL ASSESSMENT (1-2 sentences):
   - Provide a summary judgment of answer quality
   - State whether the answer is ready for use or needs revision

Be specific, cite sources by number, and prioritize critical issues.

Output ONLY valid JSON in this exact format:
{
  "overallAssessment": "...",
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "criticalIssues": ["...", "..."],
  "suggestedImprovements": ["...", "..."]
}`;
  }

  /**
   * Parse the LLM's JSON response into a SelfCritique object
   */
  private parseCritiqueResponse(responseText: string): SelfCritique {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('No JSON found in critique response');
        return this.createFallbackCritique(
          'Failed to parse LLM response - no JSON detected',
        );
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      return {
        overallAssessment:
          parsed.overallAssessment || 'No overall assessment provided',
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        criticalIssues: Array.isArray(parsed.criticalIssues)
          ? parsed.criticalIssues
          : [],
        suggestedImprovements: Array.isArray(parsed.suggestedImprovements)
          ? parsed.suggestedImprovements
          : [],
        confidence: 0, // Will be calculated separately
      };
    } catch (error) {
      this.logger.error(`Failed to parse critique response: ${error.message}`);
      this.logger.debug(`Raw response: ${responseText}`);

      // Attempt to extract what we can
      return this.createFallbackCritique(
        `JSON parsing failed: ${error.message}`,
      );
    }
  }

  /**
   * Calculate confidence in the critique itself based on quality indicators
   */
  private calculateCritiqueConfidence(
    critique: SelfCritique,
    sourceCount: number,
    gapCount: number,
  ): number {
    let confidence = 0.5; // Start with baseline

    // Factor 1: Completeness of critique (30%)
    const hasContent =
      critique.strengths.length > 0 &&
      critique.weaknesses.length > 0 &&
      critique.suggestedImprovements.length > 0;
    if (hasContent) confidence += 0.3;

    // Factor 2: Specificity of feedback (25%)
    const avgLength =
      (critique.strengths.join(' ').length +
        critique.weaknesses.join(' ').length +
        critique.suggestedImprovements.join(' ').length) /
      (critique.strengths.length +
        critique.weaknesses.length +
        critique.suggestedImprovements.length);
    if (avgLength > 50) confidence += 0.15; // Detailed feedback
    if (avgLength > 30) confidence += 0.1; // Moderate detail

    // Factor 3: Balance of critique (20%)
    const hasBalance =
      critique.strengths.length > 0 && critique.weaknesses.length > 0;
    if (hasBalance) confidence += 0.2;

    // Factor 4: Critical issues identified matches gap severity (15%)
    const criticalGaps = gapCount > 0 ? gapCount : 0;
    const hasCriticalIssues = critique.criticalIssues.length > 0;
    if (criticalGaps > 0 && hasCriticalIssues) confidence += 0.1;
    if (criticalGaps === 0 && !hasCriticalIssues) confidence += 0.05;

    // Factor 5: Source availability (10%)
    if (sourceCount > 0) confidence += 0.1;

    // Ensure confidence stays in valid range [0, 1]
    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Create a fallback critique when LLM fails or parsing errors occur
   */
  private createFallbackCritique(reason: string): SelfCritique {
    return {
      overallAssessment: `Unable to generate comprehensive critique: ${reason}`,
      strengths: ['Answer was generated successfully'],
      weaknesses: ['Automated critique could not be completed'],
      criticalIssues: [
        'Self-critique system failure - manual review recommended',
      ],
      suggestedImprovements: [
        'Retry self-critique process',
        'Perform manual quality review',
        'Verify LLM service availability',
      ],
      confidence: 0.3, // Low confidence in fallback critique
    };
  }

  /**
   * Truncate text for display purposes
   */
  private truncate(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength
      ? text.substring(0, maxLength) + '...'
      : text;
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use critiqueSynthesis instead
   */
  async generateCritique(
    answer: string,
    gaps: Gap[],
    taskId: string,
  ): Promise<string> {
    this.logger.warn(
      'generateCritique is deprecated, use critiqueSynthesis instead',
    );
    const critique = await this.critiqueSynthesis(
      answer,
      [],
      '',
      {
        overallConfidence: 0.5,
        level: 'medium',
        claimConfidences: [],
        methodology: {
          entailmentWeight: 0.5,
          suScoreWeight: 0.3,
          sourceCountWeight: 0.2,
        },
        recommendations: [],
      },
      gaps,
      taskId,
    );
    return critique.overallAssessment;
  }
}
