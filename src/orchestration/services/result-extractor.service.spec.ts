import { Test, TestingModule } from '@nestjs/testing';
import { ResultExtractorService } from './result-extractor.service';
import { PhaseResult, StepResult } from '../interfaces/phase.interface';
import { Plan } from '../interfaces/plan.interface';

describe('ResultExtractorService', () => {
  let service: ResultExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResultExtractorService],
    }).compile();

    service = module.get<ResultExtractorService>(ResultExtractorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractSources', () => {
    it('should extract sources from search results', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'tavily_search',
              output: [
                {
                  url: 'https://example.com',
                  title: 'Example',
                  content: 'Content',
                  score: 0.8,
                },
              ],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toEqual({
        url: 'https://example.com',
        title: 'Example',
        relevance: 'high',
      });
    });

    it('should return medium relevance for low scores', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'tavily_search',
              output: [
                {
                  url: 'https://example.com',
                  title: 'Example',
                  content: 'Content',
                  score: 0.5,
                },
              ],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources[0].relevance).toBe('medium');
    });
  });

  describe('extractFinalOutput', () => {
    it('should prioritize synthesis step output', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'web_fetch',
              output: 'Generic long output that is more than 50 characters long',
            },
            {
              status: 'completed',
              stepId: 'step2',
              toolName: 'synthesize',
              output: 'Synthesis output',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe('Synthesis output');
    });

    it('should fall back to generic string output if no synthesis', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'web_fetch',
              output: 'Generic long output that is more than 50 characters long',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe(
        'Generic long output that is more than 50 characters long',
      );
    });
  });

  describe('extractSearchQueries', () => {
    it('should extract queries from plan steps', () => {
      const plan: Plan = {
        id: 'plan1',
        query: 'test',
        phases: [
          {
            id: 'phase1',
            name: 'Search',
            steps: [
              {
                id: 'step1',
                toolName: 'tavily_search',
                config: { query: 'query 1' },
              } as any,
              {
                id: 'step2',
                toolName: 'web_search',
                config: { query: 'query 2' },
              } as any,
            ],
          } as any,
        ],
      } as Plan;

      const queries = service.extractSearchQueries(plan);

      expect(queries).toEqual(['query 1', 'query 2']);
    });
  });
});
