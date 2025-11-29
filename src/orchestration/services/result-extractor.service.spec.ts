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

    it('should deduplicate sources with same URL and same score', () => {
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
                  title: 'Example 1',
                  content: 'Content',
                  score: 0.8,
                },
                {
                  url: 'https://example.com',
                  title: 'Example 2',
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
      expect(sources[0].title).toBe('Example 1');
    });

    it('should prefer high relevance when deduplicating sources with different scores', () => {
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
                  title: 'Medium Score',
                  content: 'Content',
                  score: 0.5,
                },
                {
                  url: 'https://example.com',
                  title: 'High Score',
                  content: 'Content',
                  score: 0.9,
                },
              ],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources).toHaveLength(1);
      expect(sources[0].title).toBe('High Score');
      expect(sources[0].relevance).toBe('high');
    });

    it('should handle empty search result arrays', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'tavily_search',
              output: [],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources).toHaveLength(0);
    });

    it('should handle sources without scores as medium relevance', () => {
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
                  title: 'No Score',
                  content: 'Content',
                },
              ],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources).toHaveLength(1);
      expect(sources[0].relevance).toBe('medium');
    });

    it('should handle score boundary case (0.7)', () => {
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
                  title: 'Boundary',
                  content: 'Content',
                  score: 0.7,
                },
              ],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources[0].relevance).toBe('medium');
    });

    it('should extract sources from multiple phases', () => {
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
                  url: 'https://example1.com',
                  title: 'Example 1',
                  content: 'Content',
                  score: 0.8,
                },
              ],
            },
          ],
        },
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step2',
              toolName: 'web_search',
              output: [
                {
                  url: 'https://example2.com',
                  title: 'Example 2',
                  content: 'Content',
                  score: 0.9,
                },
              ],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources).toHaveLength(2);
      expect(sources[0].url).toBe('https://example1.com');
      expect(sources[1].url).toBe('https://example2.com');
    });

    it('should sort sources by relevance (high first)', () => {
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
                  url: 'https://medium.com',
                  title: 'Medium',
                  content: 'Content',
                  score: 0.5,
                },
                {
                  url: 'https://high.com',
                  title: 'High',
                  content: 'Content',
                  score: 0.9,
                },
              ],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources[0].url).toBe('https://high.com');
      expect(sources[1].url).toBe('https://medium.com');
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

    it('should return first synthesis output when multiple exist in single phase', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'synthesize',
              output: 'First synthesis',
            },
            {
              status: 'completed',
              stepId: 'step2',
              toolName: 'synthesize',
              output: 'Second synthesis',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe('First synthesis');
    });

    it('should return first synthesis output when multiple exist across phases', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'synthesize',
              output: 'Phase 1 synthesis',
            },
          ],
        },
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step2',
              toolName: 'synthesize',
              output: 'Phase 2 synthesis',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe('Phase 1 synthesis');
    });

    it('should handle empty string outputs', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'web_fetch',
              output: '',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe('');
    });

    it('should handle 50-char boundary case (not included)', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'web_fetch',
              output: '12345678901234567890123456789012345678901234567890', // exactly 50 chars
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe('');
    });

    it('should handle LLM toolName as synthesis', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'llm',
              output: 'LLM output',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe('LLM output');
    });

    it('should return empty string when no valid outputs', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'web_fetch',
              output: 'Short',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe('');
    });

    it('should return first long string when multiple phases have no synthesis', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'web_fetch',
              output:
                'First phase long output that is more than 50 characters long',
            },
          ],
        },
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step2',
              toolName: 'web_fetch',
              output:
                'Second phase long output that is more than 50 characters long',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe(
        'First phase long output that is more than 50 characters long',
      );
    });

    it('should handle empty phase results', () => {
      const output = service.extractFinalOutput([]);

      expect(output).toBe('');
    });

    it('should return synthesis even if followed by longer generic string', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'synthesize',
              output: 'Short',
            },
            {
              status: 'completed',
              stepId: 'step2',
              toolName: 'web_fetch',
              output:
                'Very long output that is more than 50 characters and should not be returned',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe('Short');
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

    it('should handle steps without config', () => {
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
              } as any,
            ],
          } as any,
        ],
      } as Plan;

      const queries = service.extractSearchQueries(plan);

      expect(queries).toEqual([]);
    });

    it('should handle steps with config but no query', () => {
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
                config: { otherParam: 'value' },
              } as any,
            ],
          } as any,
        ],
      } as Plan;

      const queries = service.extractSearchQueries(plan);

      expect(queries).toEqual([]);
    });

    it('should skip non-search tool types', () => {
      const plan: Plan = {
        id: 'plan1',
        query: 'test',
        phases: [
          {
            id: 'phase1',
            name: 'Mixed',
            steps: [
              {
                id: 'step1',
                toolName: 'web_fetch',
                config: { query: 'should not be extracted' },
              } as any,
              {
                id: 'step2',
                toolName: 'tavily_search',
                config: { query: 'should be extracted' },
              } as any,
            ],
          } as any,
        ],
      } as Plan;

      const queries = service.extractSearchQueries(plan);

      expect(queries).toEqual(['should be extracted']);
    });

    it('should handle empty phases array', () => {
      const plan: Plan = {
        id: 'plan1',
        query: 'test',
        phases: [],
      } as Plan;

      const queries = service.extractSearchQueries(plan);

      expect(queries).toEqual([]);
    });

    it('should handle empty string queries', () => {
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
                config: { query: '' },
              } as any,
              {
                id: 'step2',
                toolName: 'web_search',
                config: { query: '  ' },
              } as any,
            ],
          } as any,
        ],
      } as Plan;

      const queries = service.extractSearchQueries(plan);

      expect(queries).toEqual([]);
    });
  });

  describe('extractAllResults', () => {
    it('should extract both sources and output in single pass', () => {
      const phaseResult: PhaseResult = {
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
          {
            status: 'completed',
            stepId: 'step2',
            toolName: 'synthesize',
            output: 'Final answer',
          },
        ],
      };

      const result = service.extractAllResults(phaseResult);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].url).toBe('https://example.com');
      expect(result.output).toBe('Final answer');
    });

    it('should deduplicate sources in extractAllResults', () => {
      const phaseResult: PhaseResult = {
        status: 'completed',
        stepResults: [
          {
            status: 'completed',
            stepId: 'step1',
            toolName: 'tavily_search',
            output: [
              {
                url: 'https://example.com',
                title: 'First',
                content: 'Content',
                score: 0.5,
              },
              {
                url: 'https://example.com',
                title: 'Second',
                content: 'Content',
                score: 0.9,
              },
            ],
          },
        ],
      };

      const result = service.extractAllResults(phaseResult);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].title).toBe('Second');
      expect(result.sources[0].relevance).toBe('high');
    });

    it('should handle phase with no sources or output', () => {
      const phaseResult: PhaseResult = {
        status: 'completed',
        stepResults: [
          {
            status: 'completed',
            stepId: 'step1',
            toolName: 'web_fetch',
            output: 'Short',
          },
        ],
      };

      const result = service.extractAllResults(phaseResult);

      expect(result.sources).toHaveLength(0);
      expect(result.output).toBe('');
    });
  });
});
