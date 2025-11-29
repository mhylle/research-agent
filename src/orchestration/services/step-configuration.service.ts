// src/orchestration/services/step-configuration.service.ts
import { Injectable } from '@nestjs/common';
import { PlanStep } from '../interfaces/plan-step.interface';
import { Plan } from '../interfaces/plan.interface';
import { StepResult } from '../interfaces/phase.interface';

@Injectable()
export class StepConfigurationService {
  /**
   * Get default configuration for a tool if none is provided
   */
  getDefaultConfig(
    toolName: string,
    plan?: Plan,
    phaseResults?: StepResult[],
  ): Record<string, unknown> {
    switch (toolName) {
      case 'tavily_search':
        // Default to searching for the main query
        return { query: plan?.query || 'research query', max_results: 5 };

      case 'web_fetch':
        // Try to get URL from previous search results
        if (phaseResults) {
          for (const result of phaseResults) {
            if (Array.isArray(result.output)) {
              for (const item of result.output) {
                if (item && typeof item === 'object' && 'url' in item) {
                  return { url: item.url };
                }
              }
            }
          }
        }
        // Fallback: return empty config (will cause tool to fail gracefully)
        return {};

      default:
        return {};
    }
  }

  /**
   * Enrich a synthesize step with query and context from accumulated results
   */
  enrichSynthesizeStep(
    step: PlanStep,
    plan: Plan,
    accumulatedResults: StepResult[],
  ): void {
    // Build context from all previous phase results
    const contextString = this.buildSynthesisContext(accumulatedResults);

    // Enrich the step config (with null safety)
    const existingConfig = step.config || {};
    step.config = {
      ...existingConfig,
      query: plan.query,
      context: contextString,
      systemPrompt:
        existingConfig.systemPrompt ||
        'You are a research synthesis assistant. Analyze the provided search results and fetched content to answer the user query comprehensively.',
      prompt:
        existingConfig.prompt ||
        `Based on the research query and gathered information, provide a comprehensive answer.\n\nQuery: ${plan.query}`,
    };
  }

  /**
   * Build synthesis context from accumulated step results
   */
  private buildSynthesisContext(results: StepResult[]): string {
    const searchResults: unknown[] = [];
    const fetchResults: string[] = [];

    for (const result of results) {
      if (result.status === 'completed' && result.output) {
        // Collect search results (arrays of search result objects)
        if (Array.isArray(result.output)) {
          searchResults.push(...result.output);
        }
        // Collect fetch results (string content)
        else if (typeof result.output === 'string') {
          fetchResults.push(result.output);
        }
      }
    }

    // Build a comprehensive context string
    let contextString = '';

    if (searchResults.length > 0) {
      contextString += '## Search Results\n\n';
      contextString += JSON.stringify(searchResults, null, 2);
      contextString += '\n\n';
    }

    if (fetchResults.length > 0) {
      contextString += '## Fetched Content\n\n';
      contextString += fetchResults.join('\n\n---\n\n');
    }

    return contextString;
  }
}
