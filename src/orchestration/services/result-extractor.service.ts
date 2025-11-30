import { Injectable } from '@nestjs/common';
import { PhaseResult, StepResult } from '../interfaces/phase.interface';
import { Plan } from '../interfaces/plan.interface';

export interface Source {
  url: string;
  title: string;
  relevance: string;
}

export interface RetrievalContent {
  url: string;
  content: string;
  title?: string;
  fetchedAt?: Date;
}

@Injectable()
export class ResultExtractorService {
  /**
   * Minimum character length for valid text outputs.
   * Filters out short/empty results that are unlikely to contain useful information.
   * Based on analysis showing meaningful answers average 100+ characters.
   */
  private static readonly MIN_OUTPUT_LENGTH = 50;

  /**
   * Extracts both sources and final output from a single phase result in one pass.
   * This maintains the original atomic extraction behavior where sources and output
   * are extracted together with consistent state tracking.
   *
   * @param phaseResult - The phase result to extract data from
   * @returns Object containing sources array and final output string
   */
  extractAllResults(phaseResult: PhaseResult): {
    sources: Source[];
    output: string;
  } {
    const sourceMap = new Map<string, Source>();
    let synthesisOutput: string | null = null;
    let genericStringOutput: string | null = null;

    // Single pass through step results to extract both sources and output
    for (const stepResult of phaseResult.stepResults) {
      if (stepResult.output) {
        // Extract sources from search results
        if (Array.isArray(stepResult.output)) {
          for (const item of stepResult.output) {
            if (this.isSearchResultItem(item)) {
              const score = typeof item.score === 'number' ? item.score : null;
              const relevance =
                score !== null && score > 0.7 ? 'high' : 'medium';

              // Deduplication: only add if not exists, or if exists with lower relevance
              const existing = sourceMap.get(item.url);
              if (
                !existing ||
                (relevance === 'high' && existing.relevance === 'medium')
              ) {
                sourceMap.set(item.url, {
                  url: item.url,
                  title: item.title,
                  relevance,
                });
              }
            }
          }
        }

        // Extract final output - prioritize synthesis steps
        if (
          typeof stepResult.output === 'string' &&
          stepResult.output.trim().length > 0
        ) {
          const isSynthesisStep =
            stepResult.toolName &&
            (stepResult.toolName.toLowerCase().includes('synth') ||
              stepResult.toolName === 'llm');

          if (isSynthesisStep) {
            synthesisOutput = stepResult.output;
          } else if (
            !synthesisOutput &&
            stepResult.output.length > ResultExtractorService.MIN_OUTPUT_LENGTH
          ) {
            genericStringOutput = stepResult.output;
          }
        }
      }
    }

    // Convert source map to array, sorted by relevance (high first)
    const sources = Array.from(sourceMap.values()).sort((a, b) => {
      if (a.relevance === b.relevance) return 0;
      return a.relevance === 'high' ? -1 : 1;
    });

    return {
      sources,
      output: synthesisOutput || genericStringOutput || '',
    };
  }

  extractSources(phaseResults: PhaseResult[]): Source[] {
    const sourceMap = new Map<string, Source>();

    for (const phaseResult of phaseResults) {
      for (const stepResult of phaseResult.stepResults) {
        if (stepResult.output && Array.isArray(stepResult.output)) {
          for (const item of stepResult.output) {
            if (this.isSearchResultItem(item)) {
              const score = typeof item.score === 'number' ? item.score : null;
              const relevance =
                score !== null && score > 0.7 ? 'high' : 'medium';

              // Deduplication: only add if not exists, or if exists with lower relevance
              const existing = sourceMap.get(item.url);
              if (
                !existing ||
                (relevance === 'high' && existing.relevance === 'medium')
              ) {
                sourceMap.set(item.url, {
                  url: item.url,
                  title: item.title,
                  relevance,
                });
              }
            }
          }
        }
      }
    }

    // Return sorted by relevance (high first), then by insertion order
    return Array.from(sourceMap.values()).sort((a, b) => {
      if (a.relevance === b.relevance) return 0;
      return a.relevance === 'high' ? -1 : 1;
    });
  }

  extractFinalOutput(phaseResults: PhaseResult[]): string {
    // First pass: look for synthesis output (return immediately on first match)
    for (const phaseResult of phaseResults) {
      for (const stepResult of phaseResult.stepResults) {
        if (
          stepResult.output &&
          typeof stepResult.output === 'string' &&
          stepResult.output.trim().length > 0
        ) {
          const isSynthesisStep =
            stepResult.toolName &&
            (stepResult.toolName.toLowerCase().includes('synth') ||
              stepResult.toolName === 'llm');

          if (isSynthesisStep) {
            return stepResult.output; // Return immediately on first synthesis match
          }
        }
      }
    }

    // Second pass: look for generic string output (return immediately on first match)
    for (const phaseResult of phaseResults) {
      for (const stepResult of phaseResult.stepResults) {
        if (
          stepResult.output &&
          typeof stepResult.output === 'string' &&
          stepResult.output.length > ResultExtractorService.MIN_OUTPUT_LENGTH
        ) {
          return stepResult.output; // Return immediately on first long string
        }
      }
    }

    return '';
  }

  collectRetrievalContent(stepResults: StepResult[]): RetrievalContent[] {
    const retrievalContent: RetrievalContent[] = [];

    for (const stepResult of stepResults) {
      if (stepResult.status === 'completed' && stepResult.output) {
        if (Array.isArray(stepResult.output)) {
          for (const item of stepResult.output) {
            if (this.isSearchResultItem(item)) {
              retrievalContent.push({
                url: item.url,
                title: item.title,
                content: item.content || '',
                fetchedAt: new Date(),
              });
            }
          }
        } else if (
          typeof stepResult.output === 'string' &&
          stepResult.output.length > ResultExtractorService.MIN_OUTPUT_LENGTH
        ) {
          retrievalContent.push({
            url: `fetched-content-${retrievalContent.length}`,
            content: stepResult.output,
            title: 'Fetched Content',
            fetchedAt: new Date(),
          });
        }
      }
    }

    return retrievalContent;
  }

  extractSearchQueries(plan: Plan): string[] {
    const queries: string[] = [];
    for (const phase of plan.phases) {
      for (const step of phase.steps) {
        if (
          (step.toolName === 'web_search' ||
            step.toolName === 'tavily_search') &&
          step.config &&
          typeof step.config.query === 'string' &&
          step.config.query.trim().length > 0
        ) {
          queries.push(step.config.query);
        }
      }
    }
    return queries;
  }

  private isSearchResultItem(
    item: unknown,
  ): item is { url: string; title: string; content: string; score?: number } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'url' in item &&
      'title' in item &&
      'content' in item &&
      typeof (item as Record<string, unknown>).url === 'string' &&
      typeof (item as Record<string, unknown>).title === 'string' &&
      typeof (item as Record<string, unknown>).content === 'string'
    );
  }
}
