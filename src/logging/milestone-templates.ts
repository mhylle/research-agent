import { MilestoneTemplate } from './interfaces/enhanced-log-entry.interface';

export const MILESTONE_TEMPLATES: Record<string, MilestoneTemplate[]> = {
  stage1: [
    {
      id: 'stage1_deconstruct',
      stage: 1,
      template: 'Deconstructing query into core topics',
      expectedProgress: 20,
      order: 1,
    },
    {
      id: 'stage1_identify_terms',
      stage: 1,
      template: 'Identifying key terms: {terms}',
      expectedProgress: 40,
      order: 2,
    },
    {
      id: 'stage1_search',
      stage: 1,
      template: 'Searching {count} databases: {sources}',
      expectedProgress: 70,
      order: 3,
    },
    {
      id: 'stage1_filter',
      stage: 1,
      template: 'Filtering results for credibility',
      expectedProgress: 90,
      order: 4,
    },
  ],
  stage2: [
    {
      id: 'stage2_fetch',
      stage: 2,
      template: 'Fetching {count} relevant sources',
      expectedProgress: 30,
      order: 1,
    },
    {
      id: 'stage2_extract',
      stage: 2,
      template: 'Extracting content from {url}',
      expectedProgress: 70,
      order: 2,
    },
    {
      id: 'stage2_validate',
      stage: 2,
      template: 'Validating content quality',
      expectedProgress: 95,
      order: 3,
    },
  ],
  stage3: [
    {
      id: 'stage3_analyze',
      stage: 3,
      template: 'Analyzing {count} sources',
      expectedProgress: 20,
      order: 1,
    },
    {
      id: 'stage3_synthesize',
      stage: 3,
      template: 'Synthesizing key findings',
      expectedProgress: 50,
      order: 2,
    },
    {
      id: 'stage3_generate',
      stage: 3,
      template: 'Generating comprehensive answer',
      expectedProgress: 80,
      order: 3,
    },
    {
      id: 'stage3_format',
      stage: 3,
      template: 'Formatting final response',
      expectedProgress: 95,
      order: 4,
    },
  ],
};

// Helper to get templates for a stage
export function getMilestoneTemplates(stage: 1 | 2 | 3): MilestoneTemplate[] {
  return MILESTONE_TEMPLATES[`stage${stage}`] || [];
}

// Helper to format milestone description
export function formatMilestoneDescription(
  template: string,
  data: Record<string, any>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(`{${key}}`, String(value));
  }
  return result;
}
