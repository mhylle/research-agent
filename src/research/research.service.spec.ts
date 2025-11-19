import { Test, TestingModule } from '@nestjs/testing';
import { ResearchService } from './research.service';
import { PipelineExecutor } from './pipeline-executor.service';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { TavilySearchProvider } from '../tools/providers/tavily-search.provider';
import { WebFetchProvider } from '../tools/providers/web-fetch.provider';

describe('ResearchService', () => {
  let service: ResearchService;
  let pipelineExecutor: jest.Mocked<PipelineExecutor>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchService,
        {
          provide: PipelineExecutor,
          useValue: {
            executeStage: jest.fn(),
            executeToolCalls: jest.fn(),
          },
        },
        {
          provide: ToolRegistry,
          useValue: {
            register: jest.fn(),
          },
        },
        {
          provide: TavilySearchProvider,
          useValue: {},
        },
        {
          provide: WebFetchProvider,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ResearchService>(ResearchService);
    pipelineExecutor = module.get(PipelineExecutor);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should execute research pipeline', async () => {
    pipelineExecutor.executeStage
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: 'Search results' },
        tool_calls: [{ function: { name: 'tavily_search', arguments: { query: 'test' } } }],
        executionTime: 1000,
      })
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: 'Fetch results' },
        tool_calls: [{ function: { name: 'web_fetch', arguments: { url: 'https://test.com' } } }],
        executionTime: 2000,
      })
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: 'Final answer' },
        tool_calls: [],
        executionTime: 1500,
      });

    pipelineExecutor.executeToolCalls
      .mockResolvedValueOnce([{ title: 'Test', url: 'https://test.com', content: 'Content' }])
      .mockResolvedValueOnce([{ url: 'https://test.com', title: 'Test', content: 'Full content' }]);

    const result = await service.executeResearch('What is AI?');

    expect(result.answer).toBe('Final answer');
    expect(result.metadata.totalExecutionTime).toBeGreaterThanOrEqual(0);
    expect(result.metadata.stages).toHaveLength(3);
  });
});
