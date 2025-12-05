import { Injectable } from '@nestjs/common';
import { LLMService } from '../../llm/llm.service';
import { EventCoordinatorService } from './event-coordinator.service';
import { SubQuery } from '../interfaces/sub-query.interface';
import { DecompositionResult } from '../interfaces/decomposition-result.interface';
import { v4 as uuidv4 } from 'uuid';

interface LLMDecompositionResponse {
  isComplex: boolean;
  reasoning: string;
  subQueries: Array<{
    text: string;
    order: number;
    dependencies: string[];
    type: 'factual' | 'analytical' | 'comparative' | 'temporal';
    priority: 'high' | 'medium' | 'low';
    estimatedComplexity: number;
  }>;
}

@Injectable()
export class QueryDecomposerService {
  constructor(
    private readonly llmService: LLMService,
    private readonly eventCoordinator: EventCoordinatorService,
  ) {}

  async decomposeQuery(
    query: string,
    logId?: string,
  ): Promise<DecompositionResult> {
    const startTime = Date.now();

    try {
      // Emit decomposition started event
      if (logId) {
        await this.eventCoordinator.emit(logId, 'decomposition_started', {
          query,
        });
      }

      // Call LLM to analyze and decompose the query
      const llmResponse = await this.analyzeQueryComplexity(query);

      // If not complex, return single query
      if (!llmResponse.isComplex) {
        const result: DecompositionResult = {
          originalQuery: query,
          isComplex: false,
          subQueries: [],
          executionPlan: [],
          reasoning: llmResponse.reasoning,
        };

        if (logId) {
          await this.eventCoordinator.emit(logId, 'decomposition_completed', {
            isComplex: false,
            subQueryCount: 0,
            durationMs: Date.now() - startTime,
          });
        }

        return result;
      }

      // Generate IDs for sub-queries and create SubQuery objects
      // First pass: create sub-queries with temporary IDs
      const subQueries: SubQuery[] = llmResponse.subQueries.map((sq, index) => ({
        id: `sq-${uuidv4()}`,
        text: sq.text,
        order: sq.order || index + 1,
        dependencies: sq.dependencies || [],
        type: sq.type,
        priority: sq.priority,
        estimatedComplexity: sq.estimatedComplexity,
      }));

      // Second pass: resolve dependencies from order-based references to actual IDs
      // The LLM returns dependencies as order numbers (e.g., [1, 2]) but we need UUIDs
      subQueries.forEach((sq) => {
        sq.dependencies = sq.dependencies.map((dep) => {
          // If dependency is a number or string number, convert to actual sub-query ID
          const depOrder = typeof dep === 'string' ? parseInt(dep, 10) : dep;
          if (!isNaN(depOrder)) {
            const depSubQuery = subQueries.find((s) => s.order === depOrder);
            return depSubQuery ? depSubQuery.id : dep;
          }
          return dep;
        });
      });

      // Emit event for each sub-query identified
      if (logId) {
        for (const subQuery of subQueries) {
          await this.eventCoordinator.emit(logId, 'sub_query_identified', {
            subQueryId: subQuery.id,
            text: subQuery.text,
            type: subQuery.type,
            priority: subQuery.priority,
            complexity: subQuery.estimatedComplexity,
          });
        }
      }

      // Build execution plan with dependency resolution
      const executionPlan = this.buildExecutionPlan(subQueries);

      const result: DecompositionResult = {
        originalQuery: query,
        isComplex: true,
        subQueries,
        executionPlan,
        reasoning: llmResponse.reasoning,
      };

      if (logId) {
        await this.eventCoordinator.emit(logId, 'decomposition_completed', {
          isComplex: true,
          subQueryCount: subQueries.length,
          executionPhases: executionPlan.length,
          durationMs: Date.now() - startTime,
        });
      }

      return result;
    } catch (error) {
      if (logId) {
        await this.eventCoordinator.emit(logId, 'decomposition_completed', {
          error: error.message,
          durationMs: Date.now() - startTime,
        });
      }
      throw error;
    }
  }

  /**
   * Call LLM to analyze query complexity and decompose if needed
   */
  private async analyzeQueryComplexity(
    query: string,
  ): Promise<LLMDecompositionResponse> {
    const prompt = `Analyze this query and break it down into atomic sub-queries if needed.

QUERY: "${query}"

TASK:
1. Determine if the query is complex (multiple aspects, temporal range, comparisons)
2. If complex, break it into 2-5 atomic sub-queries that:
   - Each focus on a single aspect
   - Can be answered independently (or with minimal dependencies)
   - Together fully cover the original query
3. Identify dependencies between sub-queries
4. Assign priority and complexity to each

OUTPUT FORMAT (JSON):
{
  "isComplex": true/false,
  "reasoning": "Why this decomposition was chosen",
  "subQueries": [
    {
      "text": "Sub-query text",
      "order": 1,
      "dependencies": [],
      "type": "factual|analytical|comparative|temporal",
      "priority": "high|medium|low",
      "estimatedComplexity": 1-5
    }
  ]
}

EXAMPLES:

Query: "What is quantum computing?"
→ Not complex, no decomposition needed

Query: "Compare the economic impacts of AI and blockchain between 2020-2024"
→ Complex, decompose into:
  1. "What are the economic impacts of AI from 2020-2024?" (factual, temporal)
  2. "What are the economic impacts of blockchain from 2020-2024?" (factual, temporal)
  3. "Compare findings from queries 1 and 2" (comparative, depends on 1,2)

Respond with ONLY valid JSON, no additional text.`;

    const response = await this.llmService.chat([
      {
        role: 'system',
        content:
          'You are an expert research query analyzer. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    const content = response.message.content.trim();
    return this.parseLLMResponse(content);
  }

  /**
   * Parse LLM response into structured decomposition result
   */
  private parseLLMResponse(content: string): LLMDecompositionResponse {
    try {
      // Remove markdown code blocks if present
      const cleanedContent = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(cleanedContent);

      // Validate required fields
      if (typeof parsed.isComplex !== 'boolean') {
        throw new Error('Invalid response: missing or invalid isComplex field');
      }

      if (!parsed.reasoning || typeof parsed.reasoning !== 'string') {
        throw new Error('Invalid response: missing or invalid reasoning field');
      }

      // If not complex, return early
      if (!parsed.isComplex) {
        return {
          isComplex: false,
          reasoning: parsed.reasoning,
          subQueries: [],
        };
      }

      // Validate sub-queries array
      if (!Array.isArray(parsed.subQueries) || parsed.subQueries.length === 0) {
        throw new Error(
          'Invalid response: subQueries must be non-empty array for complex queries',
        );
      }

      // Validate each sub-query
      const subQueries = parsed.subQueries.map((sq: any, index: number) => {
        if (!sq.text || typeof sq.text !== 'string') {
          throw new Error(`Sub-query ${index}: missing or invalid text field`);
        }

        if (!['factual', 'analytical', 'comparative', 'temporal'].includes(sq.type)) {
          throw new Error(`Sub-query ${index}: invalid type field`);
        }

        if (!['high', 'medium', 'low'].includes(sq.priority)) {
          throw new Error(`Sub-query ${index}: invalid priority field`);
        }

        if (
          typeof sq.estimatedComplexity !== 'number' ||
          sq.estimatedComplexity < 1 ||
          sq.estimatedComplexity > 5
        ) {
          throw new Error(
            `Sub-query ${index}: estimatedComplexity must be 1-5`,
          );
        }

        return {
          text: sq.text,
          order: sq.order || index + 1,
          dependencies: Array.isArray(sq.dependencies) ? sq.dependencies : [],
          type: sq.type as 'factual' | 'analytical' | 'comparative' | 'temporal',
          priority: sq.priority as 'high' | 'medium' | 'low',
          estimatedComplexity: sq.estimatedComplexity,
        };
      });

      return {
        isComplex: true,
        reasoning: parsed.reasoning,
        subQueries,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse LLM decomposition response: ${error.message}`,
      );
    }
  }

  /**
   * Build execution plan by resolving dependencies and detecting circular dependencies
   * Returns phases of sub-queries that can be executed in parallel
   */
  private buildExecutionPlan(subQueries: SubQuery[]): SubQuery[][] {
    const phases: SubQuery[][] = [];
    const completed = new Set<string>();
    const remaining = [...subQueries];

    // Create a map for quick lookup by ID
    const idMap = new Map<string, SubQuery>();
    subQueries.forEach((sq) => idMap.set(sq.id, sq));

    while (remaining.length > 0) {
      // Find all sub-queries with satisfied dependencies
      const readyToExecute = remaining.filter((sq) =>
        sq.dependencies.every((dep) => {
          // Check if dependency exists and is completed
          return completed.has(dep) || !idMap.has(dep);
        }),
      );

      if (readyToExecute.length === 0) {
        // No sub-queries ready means circular dependency
        const remainingIds = remaining.map((sq) => sq.id).join(', ');
        const pendingDeps = remaining
          .flatMap((sq) => sq.dependencies)
          .filter((dep) => !completed.has(dep))
          .join(', ');

        throw new Error(
          `Circular dependency detected in sub-queries. Remaining: [${remainingIds}], Pending dependencies: [${pendingDeps}]`,
        );
      }

      // Add to current phase and mark completed
      phases.push(readyToExecute);
      readyToExecute.forEach((sq) => {
        completed.add(sq.id);
        const index = remaining.indexOf(sq);
        remaining.splice(index, 1);
      });
    }

    return phases;
  }
}
