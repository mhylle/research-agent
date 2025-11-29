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
  extractSources(phaseResults: PhaseResult[]): Source[] {
    const sources: Source[] = [];

    for (const phaseResult of phaseResults) {
      for (const stepResult of phaseResult.stepResults) {
        if (stepResult.output && Array.isArray(stepResult.output)) {
          for (const item of stepResult.output) {
            if (this.isSearchResultItem(item)) {
              const score = typeof item.score === 'number' ? item.score : 0;
              sources.push({
                url: item.url,
                title: item.title,
                relevance: score > 0.7 ? 'high' : 'medium',
              });
            }
          }
        }
      }
    }

    return sources;
  }

  extractFinalOutput(phaseResults: PhaseResult[]): string {
    let synthesisOutput: string | null = null;
    let genericStringOutput: string | null = null;

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
            synthesisOutput = stepResult.output;
          } else if (!synthesisOutput && stepResult.output.length > 50) {
            genericStringOutput = stepResult.output;
          }
        }
      }
    }

    return synthesisOutput || genericStringOutput || '';
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
          stepResult.output.length > 50
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
          (step.toolName === 'web_search' || step.toolName === 'tavily_search') &&
          step.config?.query
        ) {
          queries.push(step.config.query as string);
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
