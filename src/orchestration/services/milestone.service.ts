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

    // Emit initial milestones for the phase
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

      await this.delay(100);
    }
  }

  async emitPhaseCompletion(phase: Phase, logId: string): Promise<void> {
    const stageType = this.detectPhaseType(phase.name);
    if (!stageType) return;

    const templates = getMilestoneTemplates(stageType);
    if (templates.length === 0) return;

    const lastTemplate = templates[templates.length - 1];
    const milestoneId = `${phase.id}_${lastTemplate.id}`;
    const description = formatMilestoneDescription(lastTemplate.template, {});

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
      },
      phase.id,
    );
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
