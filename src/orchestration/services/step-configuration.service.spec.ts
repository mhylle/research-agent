// src/orchestration/services/step-configuration.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { StepConfigurationService } from './step-configuration.service';
import { PlanStep } from '../interfaces/plan-step.interface';
import { Plan } from '../interfaces/plan.interface';
import { StepResult } from '../interfaces/phase.interface';

describe('StepConfigurationService', () => {
  let service: StepConfigurationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StepConfigurationService],
    }).compile();

    service = module.get<StepConfigurationService>(StepConfigurationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDefaultConfig', () => {
    it('should return default config for tavily_search with plan', () => {
      const plan: Plan = {
        id: 'plan-1',
        query: 'What is TypeScript?',
        phases: [],
        status: 'pending',
        createdAt: new Date(),
      };

      const config = service.getDefaultConfig('tavily_search', plan);

      expect(config).toEqual({
        query: 'What is TypeScript?',
        max_results: 5,
      });
    });

    it('should return default config for tavily_search without plan', () => {
      const config = service.getDefaultConfig('tavily_search');

      expect(config).toEqual({
        query: 'research query',
        max_results: 5,
      });
    });

    it('should extract URL from search results for web_fetch', () => {
      const phaseResults: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-1',
          output: [
            { url: 'https://example.com', title: 'Example' },
            { url: 'https://example2.com', title: 'Example 2' },
          ],
          input: {},
          toolName: 'tavily_search',
        },
      ];

      const config = service.getDefaultConfig('web_fetch', undefined, phaseResults);

      expect(config).toEqual({
        url: 'https://example.com',
      });
    });

    it('should return empty config for web_fetch without search results', () => {
      const config = service.getDefaultConfig('web_fetch');

      expect(config).toEqual({});
    });

    it('should return empty config for web_fetch with no URL in results', () => {
      const phaseResults: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-1',
          output: 'some text content',
          input: {},
          toolName: 'web_fetch',
        },
      ];

      const config = service.getDefaultConfig('web_fetch', undefined, phaseResults);

      expect(config).toEqual({});
    });

    it('should return empty config for unknown tool', () => {
      const config = service.getDefaultConfig('unknown_tool');

      expect(config).toEqual({});
    });
  });

  describe('enrichSynthesizeStep', () => {
    let step: PlanStep;
    let plan: Plan;

    beforeEach(() => {
      step = {
        id: 'step-1',
        toolName: 'synthesize',
        type: 'llm',
        config: {},
        dependencies: [],
        status: 'pending',
        order: 0,
        phaseId: 'phase-1',
      };

      plan = {
        id: 'plan-1',
        query: 'What is TypeScript?',
        phases: [],
        status: 'pending',
        createdAt: new Date(),
      };
    });

    it('should enrich step with query and search results', () => {
      const accumulatedResults: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-search',
          output: [
            { url: 'https://example.com', title: 'Example', content: 'content1' },
          ],
          input: {},
          toolName: 'tavily_search',
        },
      ];

      service.enrichSynthesizeStep(step, plan, accumulatedResults);

      expect(step.config.query).toBe('What is TypeScript?');
      expect(step.config.context).toContain('## Search Results');
      expect(step.config.context).toContain('https://example.com');
      expect(step.config.systemPrompt).toBeDefined();
      expect(step.config.prompt).toContain('What is TypeScript?');
    });

    it('should enrich step with fetch results', () => {
      const accumulatedResults: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-fetch',
          output: 'Fetched content about TypeScript',
          input: {},
          toolName: 'web_fetch',
        },
      ];

      service.enrichSynthesizeStep(step, plan, accumulatedResults);

      expect(step.config.query).toBe('What is TypeScript?');
      expect(step.config.context).toContain('## Fetched Content');
      expect(step.config.context).toContain('Fetched content about TypeScript');
    });

    it('should enrich step with both search and fetch results', () => {
      const accumulatedResults: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-search',
          output: [{ url: 'https://example.com', title: 'Example' }],
          input: {},
          toolName: 'tavily_search',
        },
        {
          status: 'completed',
          stepId: 'step-fetch',
          output: 'Fetched content',
          input: {},
          toolName: 'web_fetch',
        },
      ];

      service.enrichSynthesizeStep(step, plan, accumulatedResults);

      expect(step.config.context).toContain('## Search Results');
      expect(step.config.context).toContain('https://example.com');
      expect(step.config.context).toContain('## Fetched Content');
      expect(step.config.context).toContain('Fetched content');
    });

    it('should preserve existing config properties', () => {
      step.config = {
        existingProp: 'value',
        systemPrompt: 'Custom system prompt',
      };

      const accumulatedResults: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-search',
          output: [{ url: 'https://example.com' }],
          input: {},
          toolName: 'tavily_search',
        },
      ];

      service.enrichSynthesizeStep(step, plan, accumulatedResults);

      expect(step.config.existingProp).toBe('value');
      expect(step.config.systemPrompt).toBe('Custom system prompt');
      expect(step.config.query).toBe('What is TypeScript?');
    });

    it('should handle empty accumulated results', () => {
      service.enrichSynthesizeStep(step, plan, []);

      expect(step.config.query).toBe('What is TypeScript?');
      expect(step.config.context).toBe('');
      expect(step.config.systemPrompt).toBeDefined();
      expect(step.config.prompt).toBeDefined();
    });

    it('should handle failed step results', () => {
      const accumulatedResults: StepResult[] = [
        {
          status: 'failed',
          stepId: 'step-search',
          error: new Error('Search failed'),
          input: {},
          toolName: 'tavily_search',
        },
      ];

      service.enrichSynthesizeStep(step, plan, accumulatedResults);

      expect(step.config.query).toBe('What is TypeScript?');
      expect(step.config.context).toBe('');
    });

    it('should handle null config on step', () => {
      step.config = null as any;

      const accumulatedResults: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-search',
          output: [{ url: 'https://example.com' }],
          input: {},
          toolName: 'tavily_search',
        },
      ];

      service.enrichSynthesizeStep(step, plan, accumulatedResults);

      expect(step.config).toBeDefined();
      expect(step.config.query).toBe('What is TypeScript?');
    });

    it('should handle undefined config on step', () => {
      step.config = undefined as any;

      const accumulatedResults: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-search',
          output: [{ url: 'https://example.com' }],
          input: {},
          toolName: 'tavily_search',
        },
      ];

      service.enrichSynthesizeStep(step, plan, accumulatedResults);

      expect(step.config).toBeDefined();
      expect(step.config.query).toBe('What is TypeScript?');
    });

    it('should build correct synthesis context with multiple results', () => {
      const accumulatedResults: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-1',
          output: [
            { url: 'https://example1.com', title: 'Result 1' },
            { url: 'https://example2.com', title: 'Result 2' },
          ],
          input: {},
          toolName: 'tavily_search',
        },
        {
          status: 'completed',
          stepId: 'step-2',
          output: 'Content from first fetch',
          input: {},
          toolName: 'web_fetch',
        },
        {
          status: 'completed',
          stepId: 'step-3',
          output: 'Content from second fetch',
          input: {},
          toolName: 'web_fetch',
        },
      ];

      service.enrichSynthesizeStep(step, plan, accumulatedResults);

      expect(step.config.context).toContain('example1.com');
      expect(step.config.context).toContain('example2.com');
      expect(step.config.context).toContain('Content from first fetch');
      expect(step.config.context).toContain('Content from second fetch');
      expect(step.config.context).toContain('---'); // Separator between fetch results
    });
  });

  describe('buildSynthesisContext', () => {
    it('should build empty context for no results', () => {
      const context = (service as any).buildSynthesisContext([]);

      expect(context).toBe('');
    });

    it('should build context with only search results', () => {
      const results: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-1',
          output: [{ url: 'https://example.com', title: 'Example' }],
          input: {},
          toolName: 'tavily_search',
        },
      ];

      const context = (service as any).buildSynthesisContext(results);

      expect(context).toContain('## Search Results');
      expect(context).toContain('https://example.com');
      expect(context).not.toContain('## Fetched Content');
    });

    it('should build context with only fetch results', () => {
      const results: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-1',
          output: 'Fetched content',
          input: {},
          toolName: 'web_fetch',
        },
      ];

      const context = (service as any).buildSynthesisContext(results);

      expect(context).toContain('## Fetched Content');
      expect(context).toContain('Fetched content');
      expect(context).not.toContain('## Search Results');
    });

    it('should build context with both search and fetch results', () => {
      const results: StepResult[] = [
        {
          status: 'completed',
          stepId: 'step-1',
          output: [{ url: 'https://example.com' }],
          input: {},
          toolName: 'tavily_search',
        },
        {
          status: 'completed',
          stepId: 'step-2',
          output: 'Fetched content',
          input: {},
          toolName: 'web_fetch',
        },
      ];

      const context = (service as any).buildSynthesisContext(results);

      expect(context).toContain('## Search Results');
      expect(context).toContain('## Fetched Content');
    });
  });
});
