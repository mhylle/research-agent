import { Injectable } from '@nestjs/common';
import { OllamaService } from '../../llm/ollama.service';
import { EventCoordinatorService } from './event-coordinator.service';
import { Source } from './result-extractor.service';
import { SubQuery } from '../interfaces/sub-query.interface';
import {
  CoverageResult,
  SuggestedRetrieval,
} from '../interfaces/coverage-result.interface';
import { QueryAspect } from '../interfaces/query-aspect.interface';

@Injectable()
export class CoverageAnalyzerService {
  private readonly DEFAULT_COVERAGE_THRESHOLD = 0.85;
  private readonly MIN_CONFIDENCE = 0.7;

  constructor(
    private readonly ollamaService: OllamaService,
    private readonly eventCoordinator: EventCoordinatorService,
  ) {}

  /**
   * Analyzes whether the current answer adequately covers all aspects of the query.
   *
   * @param query - The original user query
   * @param currentAnswer - The current synthesized answer
   * @param sources - Sources used to generate the answer
   * @param subQueries - Optional decomposed sub-queries
   * @param logId - Optional log ID for event tracking
   * @returns Coverage analysis result with missing aspects and suggested retrievals
   */
  async analyzeCoverage(
    query: string,
    currentAnswer: string,
    sources: Source[],
    subQueries?: SubQuery[],
    logId?: string,
  ): Promise<CoverageResult> {
    if (logId) {
      await this.eventCoordinator.emit(
        logId,
        'coverage_analysis_started',
        {
          query,
          answerLength: currentAnswer.length,
          sourceCount: sources.length,
          subQueryCount: subQueries?.length || 0,
        },
      );
    }

    const prompt = this.buildCoverageAnalysisPrompt(
      query,
      currentAnswer,
      sources,
      subQueries,
    );

    try {
      const response = await this.ollamaService.chat([
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const parsed = this.parseLLMResponse(response.message.content);
      const overallCoverage = this.calculateOverallCoverage(parsed.aspects);

      const aspectsCovered = parsed.aspects.filter(
        (a) => a.answered && a.confidence >= this.MIN_CONFIDENCE,
      );
      const aspectsMissing = parsed.aspects.filter(
        (a) => !a.answered || a.confidence < this.MIN_CONFIDENCE,
      );

      const result: CoverageResult = {
        overallCoverage,
        aspectsCovered,
        aspectsMissing,
        suggestedRetrievals: parsed.suggestedRetrievals,
        isComplete: overallCoverage >= this.DEFAULT_COVERAGE_THRESHOLD,
      };

      if (logId) {
        await this.eventCoordinator.emit(
          logId,
          'coverage_analysis_completed',
          {
            overallCoverage,
            aspectsCoveredCount: aspectsCovered.length,
            aspectsMissingCount: aspectsMissing.length,
            suggestedRetrievalsCount: parsed.suggestedRetrievals.length,
            isComplete: result.isComplete,
          },
        );
      }

      return result;
    } catch (error) {
      if (logId) {
        await this.eventCoordinator.emit(
          logId,
          'coverage_analysis_completed',
          {
            error: error.message,
            overallCoverage: 0,
            isComplete: false,
          },
        );
      }
      throw error;
    }
  }

  /**
   * Suggests additional retrieval queries to fill coverage gaps.
   *
   * @param missingAspects - Query aspects that are not adequately covered
   * @param logId - Optional log ID for event tracking
   * @returns Prioritized list of suggested retrieval queries
   */
  async suggestAdditionalRetrieval(
    missingAspects: QueryAspect[],
    logId?: string,
  ): Promise<SuggestedRetrieval[]> {
    if (missingAspects.length === 0) {
      return [];
    }

    const suggestions: SuggestedRetrieval[] = missingAspects.map((aspect) => {
      const priority = this.determinePriority(aspect);
      const searchQuery = this.buildSearchQuery(aspect);

      return {
        aspect: aspect.description,
        searchQuery,
        priority,
        reasoning: `Missing coverage for: ${aspect.description}. Current confidence: ${aspect.confidence.toFixed(2)}`,
      };
    });

    // Sort by priority: high > medium > low
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
    );

    return suggestions;
  }

  /**
   * Calculates overall coverage score based on aspect coverage.
   *
   * @param aspects - All identified query aspects
   * @returns Overall coverage score (0-1)
   */
  private calculateOverallCoverage(aspects: QueryAspect[]): number {
    if (aspects.length === 0) return 1.0;

    const weightedSum = aspects.reduce((sum, aspect) => {
      // Answered aspects contribute their confidence
      // Unanswered aspects contribute 0
      return sum + (aspect.answered ? aspect.confidence : 0);
    }, 0);

    return weightedSum / aspects.length;
  }

  /**
   * Builds the coverage analysis prompt for the LLM.
   */
  private buildCoverageAnalysisPrompt(
    query: string,
    currentAnswer: string,
    sources: Source[],
    subQueries?: SubQuery[],
  ): string {
    const sourcesText = sources
      .map((s, idx) => `${idx + 1}. ${s.title} (${s.url})`)
      .join('\n');

    const subQueriesText = subQueries?.length
      ? '\n\nSUB-QUERIES (if decomposed):\n' +
        subQueries.map((sq, idx) => `${idx + 1}. ${sq.text}`).join('\n')
      : '';

    return `Analyze whether the current answer adequately covers all aspects of the query.

ORIGINAL QUERY: "${query}"${subQueriesText}

CURRENT ANSWER:
${currentAnswer}

SOURCES USED:
${sourcesText}

TASK:
1. Identify all distinct aspects/questions implied by the query
2. For each aspect, determine:
   - Is it addressed in the answer? (yes/no)
   - How well is it addressed? (confidence 0-1)
   - Which sources support this aspect?
3. Identify missing or poorly covered aspects
4. Suggest additional searches to fill gaps

OUTPUT FORMAT (JSON):
{
  "aspects": [
    {
      "id": "unique-id",
      "description": "Aspect description",
      "keywords": ["key", "terms"],
      "answered": true/false,
      "confidence": 0.0-1.0,
      "supportingSources": ["source1", "source2"]
    }
  ],
  "suggestedRetrievals": [
    {
      "aspect": "Missing aspect description",
      "searchQuery": "Specific search query to fill gap",
      "priority": "high|medium|low",
      "reasoning": "Why this retrieval is needed"
    }
  ]
}

COVERAGE THRESHOLD: 0.85 (85% of aspects covered with confidence ≥0.7)

Respond with valid JSON only.`;
  }

  /**
   * Parses the LLM response into structured coverage data.
   */
  private parseLLMResponse(content: string): {
    aspects: QueryAspect[];
    suggestedRetrievals: SuggestedRetrieval[];
  } {
    try {
      // Extract JSON from markdown code blocks if present
      let jsonContent = content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonContent);

      // Validate and transform aspects
      const aspects: QueryAspect[] = (parsed.aspects || []).map(
        (aspect: any) => ({
          id: aspect.id || this.generateAspectId(aspect.description),
          description: aspect.description || '',
          keywords: Array.isArray(aspect.keywords) ? aspect.keywords : [],
          answered: aspect.answered === true,
          confidence: typeof aspect.confidence === 'number' ? aspect.confidence : 0,
          supportingSources: Array.isArray(aspect.supportingSources)
            ? aspect.supportingSources
            : [],
        }),
      );

      // Validate and transform suggested retrievals
      const suggestedRetrievals: SuggestedRetrieval[] = (
        parsed.suggestedRetrievals || []
      ).map((retrieval: any) => ({
        aspect: retrieval.aspect || '',
        searchQuery: retrieval.searchQuery || '',
        priority: this.normalizePriority(retrieval.priority),
        reasoning: retrieval.reasoning || '',
      }));

      return { aspects, suggestedRetrievals };
    } catch (error) {
      // Fallback: return minimal structure if parsing fails
      return {
        aspects: [],
        suggestedRetrievals: [],
      };
    }
  }

  /**
   * Generates a unique ID for an aspect based on its description.
   */
  private generateAspectId(description: string): string {
    return `aspect-${description.toLowerCase().replace(/\s+/g, '-').substring(0, 30)}-${Date.now()}`;
  }

  /**
   * Normalizes priority values to valid types.
   */
  private normalizePriority(
    priority: any,
  ): 'high' | 'medium' | 'low' {
    const normalized = String(priority).toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
      return normalized;
    }
    return 'medium'; // Default to medium
  }

  /**
   * Determines the priority of a missing aspect based on its characteristics.
   */
  private determinePriority(aspect: QueryAspect): 'high' | 'medium' | 'low' {
    // High priority: completely unanswered aspects
    if (!aspect.answered) {
      return 'high';
    }

    // Medium priority: low confidence answers (0.4-0.7)
    if (aspect.confidence < this.MIN_CONFIDENCE && aspect.confidence >= 0.4) {
      return 'medium';
    }

    // Low priority: slightly low confidence (0.7-0.85)
    return 'low';
  }

  /**
   * Builds a search query from an aspect's keywords and description.
   */
  private buildSearchQuery(aspect: QueryAspect): string {
    if (aspect.keywords.length > 0) {
      return aspect.keywords.slice(0, 5).join(' ');
    }
    // Fallback: use first few words of description
    return aspect.description.split(/\s+/).slice(0, 6).join(' ');
  }
}
