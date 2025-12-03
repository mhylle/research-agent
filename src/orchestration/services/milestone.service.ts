import { Injectable } from '@nestjs/common';
import { EventCoordinatorService } from './event-coordinator.service';
import { Phase } from '../interfaces/phase.interface';
import {
  getMilestoneTemplates,
  formatMilestoneDescription,
} from '../../logging/milestone-templates';

@Injectable()
export class MilestoneService {
  constructor(private readonly eventCoordinator: EventCoordinatorService) {}

  async emitMilestonesForPhase(
    phase: Phase,
    logId: string,
    query: string,
  ): Promise<void> {
    const stageType = this.detectPhaseType(phase.name);
    if (!stageType) {
      console.log(
        `[MilestoneService] Phase "${phase.name}" does not map to a milestone stage`,
      );
      return;
    }

    const templates = getMilestoneTemplates(stageType);
    console.log(
      `[MilestoneService] Emitting ${templates.length} milestones for stage ${stageType} (${phase.name})`,
    );

    // Emit and immediately complete individual milestones (all except the last one)
    // The last milestone will be completed when the entire phase completes
    for (let i = 0; i < templates.length - 1; i++) {
      const template = templates[i];
      const milestoneId = `${phase.id}_${template.id}`;

      const templateData = this.buildMilestoneTemplateData(
        stageType,
        template.id,
        query,
        phase,
      );
      const description = formatMilestoneDescription(
        template.template,
        templateData,
      );

      // Emit milestone started
      await this.eventCoordinator.emit(
        logId,
        'milestone_started',
        {
          milestoneId,
          templateId: template.id,
          stage: stageType,
          description,
          template: template.template,
          templateData,
          progress: template.expectedProgress,
          status: 'running',
        },
        phase.id,
      );

      await this.delay(50);

      // Immediately complete the milestone with output data
      const output = this.buildMilestoneOutput(
        stageType,
        template.id,
        query,
        phase,
      );
      await this.eventCoordinator.emit(
        logId,
        'milestone_completed',
        {
          milestoneId,
          templateId: template.id,
          stage: stageType,
          description,
          template: template.template,
          templateData,
          progress: template.expectedProgress,
          status: 'completed',
          output,
        },
        phase.id,
      );

      await this.delay(50);
    }
  }

  async emitPhaseCompletion(
    phase: Phase,
    logId: string,
    stepResults?: Array<{ stepId: string; output?: any; toolName?: string }>,
  ): Promise<void> {
    const stageType = this.detectPhaseType(phase.name);
    if (!stageType) return;

    const templates = getMilestoneTemplates(stageType);
    if (templates.length === 0) return;

    const lastTemplate = templates[templates.length - 1];
    const milestoneId = `${phase.id}_${lastTemplate.id}`;
    const description = formatMilestoneDescription(lastTemplate.template, {});

    // Build output data from step results
    const output = this.buildPhaseOutput(phase, stepResults);

    await this.eventCoordinator.emit(
      logId,
      'milestone_completed',
      {
        milestoneId,
        templateId: lastTemplate.id,
        stage: stageType,
        description,
        template: lastTemplate.template,
        templateData: {},
        progress: lastTemplate.expectedProgress,
        status: 'completed',
        output, // Include the output data
      },
      phase.id,
    );
  }

  /**
   * Build output data for individual milestones
   */
  private buildMilestoneOutput(
    stage: 1 | 2 | 3,
    templateId: string,
    query: string,
    phase: Phase,
  ): Record<string, any> {
    switch (stage) {
      case 1: // Search/Query phase
        if (templateId === 'stage1_deconstruct') {
          return {
            action: 'Query deconstructed',
            query,
            complexity: this.assessQueryComplexity(query),
          };
        }
        if (templateId === 'stage1_identify_terms') {
          const terms = this.extractKeyTerms(query);
          return {
            action: 'Key terms identified',
            terms,
            termCount: terms.length,
          };
        }
        if (templateId === 'stage1_search') {
          return {
            action: 'Database search initiated',
            databases: ['Tavily'],
            searchCount: phase.steps.length,
            status: 'searching',
          };
        }
        if (templateId === 'stage1_filter') {
          return {
            action: 'Results filtered',
            criteria: ['credibility', 'relevance', 'freshness'],
            status: 'filtering',
          };
        }
        return { milestone: templateId, status: 'completed' };

      case 2: // Fetch/Content phase
        if (templateId === 'stage2_fetch') {
          return {
            action: 'Sources fetched',
            sourceCount: phase.steps.length,
            status: 'fetching',
          };
        }
        if (templateId === 'stage2_extract') {
          return {
            action: 'Content extraction initiated',
            method: 'web_fetch',
            status: 'extracting',
          };
        }
        if (templateId === 'stage2_validate') {
          return {
            action: 'Content validation',
            checks: ['completeness', 'relevance', 'quality'],
            status: 'validating',
          };
        }
        return { milestone: templateId, status: 'completed' };

      case 3: // Synthesis/Answer phase
        if (templateId === 'stage3_analyze') {
          return {
            action: 'Sources analyzed',
            sourceCount: phase.steps.length,
            status: 'analyzing',
          };
        }
        if (templateId === 'stage3_synthesize') {
          return {
            action: 'Findings synthesized',
            method: 'LLM synthesis',
            status: 'synthesizing',
          };
        }
        if (templateId === 'stage3_generate') {
          return {
            action: 'Answer generation',
            format: 'comprehensive',
            status: 'generating',
          };
        }
        if (templateId === 'stage3_format') {
          return {
            action: 'Response formatted',
            format: 'structured text',
            status: 'formatting',
          };
        }
        return { milestone: templateId, status: 'completed' };

      default:
        return { milestone: templateId, status: 'completed' };
    }
  }

  /**
   * Build meaningful output data from phase execution results
   * Includes actual tool outputs for debugging and transparency
   */
  private buildPhaseOutput(
    phase: Phase,
    stepResults?: Array<{ stepId: string; output?: any; toolName?: string }>,
  ): Record<string, any> {
    if (!stepResults || stepResults.length === 0) {
      return {
        phaseName: phase.name,
        stepsCompleted: 0,
        message: 'Phase completed with no steps executed',
      };
    }

    // Build summary of what was accomplished
    const completedSteps = stepResults.filter((r) => r.output !== undefined);
    const output: Record<string, any> = {
      phaseName: phase.name,
      stepsCompleted: completedSteps.length,
      totalSteps: stepResults.length,
    };

    // Include tool-specific summaries
    const toolSummary: Record<string, number> = {};
    stepResults.forEach((result) => {
      if (result.toolName) {
        toolSummary[result.toolName] = (toolSummary[result.toolName] || 0) + 1;
      }
    });
    output.toolsUsed = toolSummary;

    // IMPORTANT: Include actual step outputs for debugging
    // This is critical for understanding what each tool actually returned
    output.stepOutputs = completedSteps.map((result) => {
      const stepOutput: Record<string, any> = {
        stepId: result.stepId,
        toolName: result.toolName || 'unknown',
      };

      // Format the output based on type
      if (Array.isArray(result.output)) {
        // For array results (search results), include full data
        stepOutput.resultCount = result.output.length;
        stepOutput.results = result.output.map((item: any) => {
          // For search results, extract key fields
          if (typeof item === 'object' && item !== null) {
            return {
              title: item.title || item.query || undefined,
              url: item.url || undefined,
              snippet:
                item.snippet || item.content?.substring(0, 300) || undefined,
              score: item.score || item.relevanceScore || undefined,
              source: item.source || undefined,
              // Include any other important fields
              ...(item.logId && { logId: item.logId }),
              ...(item.answer && {
                answer:
                  item.answer.substring(0, 500) +
                  (item.answer.length > 500 ? '...' : ''),
              }),
            };
          }
          return item;
        });
      } else if (typeof result.output === 'string') {
        // For string outputs (synthesis), include with truncation
        stepOutput.contentLength = result.output.length;
        stepOutput.content =
          result.output.length > 1000
            ? result.output.substring(0, 1000) + '...'
            : result.output;
      } else if (typeof result.output === 'object' && result.output !== null) {
        // For object outputs, include as-is (with size limit)
        const outputStr = JSON.stringify(result.output);
        if (outputStr.length > 5000) {
          stepOutput.output = JSON.parse(
            outputStr.substring(0, 5000) + '..."truncated"}',
          );
        } else {
          stepOutput.output = result.output;
        }
      } else {
        stepOutput.output = result.output;
      }

      return stepOutput;
    });

    // For search phases, include result counts
    if (phase.name.toLowerCase().includes('search')) {
      const searchResults = completedSteps.filter((r) =>
        Array.isArray(r.output),
      );
      if (searchResults.length > 0) {
        const totalResults = searchResults.reduce(
          (sum, r) => sum + (Array.isArray(r.output) ? r.output.length : 0),
          0,
        );
        output.searchResultsFound = totalResults;
      }
    }

    // For synthesis phases, include the generated content summary
    if (
      phase.name.toLowerCase().includes('synth') ||
      phase.name.toLowerCase().includes('answer')
    ) {
      const synthesisResult = completedSteps.find(
        (r) => typeof r.output === 'string',
      );
      if (synthesisResult && typeof synthesisResult.output === 'string') {
        output.contentGenerated = true;
        output.contentLength = synthesisResult.output.length;
        // Include first 500 chars as preview (increased from 200)
        output.preview =
          synthesisResult.output.substring(0, 500) +
          (synthesisResult.output.length > 500 ? '...' : '');
      }
    }

    return output;
  }

  private detectPhaseType(phaseName: string): 1 | 2 | 3 | null {
    const name = phaseName.toLowerCase();
    if (
      name.includes('search') ||
      name.includes('initial') ||
      name.includes('query')
    ) {
      return 1;
    }
    if (
      name.includes('fetch') ||
      name.includes('content') ||
      name.includes('gather')
    ) {
      return 2;
    }
    if (
      name.includes('synth') ||
      name.includes('answer') ||
      name.includes('generat')
    ) {
      return 3;
    }
    return null;
  }

  private buildMilestoneTemplateData(
    stage: 1 | 2 | 3,
    templateId: string,
    query: string,
    phase: Phase,
  ): Record<string, unknown> {
    switch (stage) {
      case 1:
        if (templateId === 'stage1_identify_terms') {
          const terms = this.extractKeyTerms(query);
          return { terms: terms.join(', ') };
        }
        if (templateId === 'stage1_search') {
          return {
            count: phase.steps.length,
            sources: 'Tavily (web sources, news, articles)',
          };
        }
        return {};

      case 2:
        if (templateId === 'stage2_fetch') {
          return { count: phase.steps.length };
        }
        if (templateId === 'stage2_extract') {
          return { url: 'source content' };
        }
        return {};

      case 3:
        if (templateId === 'stage3_analyze') {
          return { count: phase.steps.length };
        }
        return {};

      default:
        return {};
    }
  }

  private extractKeyTerms(query: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'been',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'can',
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'this',
      'that',
      'these',
      'those',
      'latest',
      'current',
      'recent',
      'about',
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    const uniqueWords = [...new Set(words)];
    return uniqueWords.sort((a, b) => b.length - a.length).slice(0, 5);
  }

  /**
   * Assess query complexity based on word count and content
   */
  private assessQueryComplexity(
    query: string,
  ): 'simple' | 'medium' | 'complex' {
    const words = query.trim().split(/\s+/);
    const wordCount = words.length;

    // Simple: 1-5 words (e.g., "What is 2+2?", "Capital of France")
    if (wordCount <= 5) {
      return 'simple';
    }

    // Complex: >15 words or contains multiple question indicators
    const questionIndicators = (
      query.match(/\?|how|why|compare|analyze|explain|difference/gi) || []
    ).length;
    if (wordCount > 15 || questionIndicators >= 2) {
      return 'complex';
    }

    // Medium: 6-15 words with single question focus
    return 'medium';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
