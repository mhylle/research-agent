import { Test, TestingModule } from '@nestjs/testing';
import { ResearchService } from './research.service';
import { Orchestrator } from '../orchestration/orchestrator.service';

jest.mock('jsdom');
jest.mock('@mozilla/readability');
jest.mock('playwright');

describe('ResearchService', () => {
  let service: ResearchService;
  let orchestrator: jest.Mocked<Orchestrator>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchService,
        {
          provide: Orchestrator,
          useValue: {
            executeResearch: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ResearchService>(ResearchService);
    orchestrator = module.get(Orchestrator);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should execute research via orchestrator', async () => {
    const mockResult = {
      answer: 'Final answer',
      metadata: {
        totalExecutionTime: 4500,
        stages: [
          { stage: 1, executionTime: 1000 },
          { stage: 2, executionTime: 2000 },
          { stage: 3, executionTime: 1500 },
        ],
      },
    };

    orchestrator.executeResearch.mockResolvedValue(mockResult as any);

    const result = await service.executeResearch('What is AI?');

    expect(result.answer).toBe('Final answer');
    expect(result.metadata.totalExecutionTime).toBe(4500);
    expect(orchestrator.executeResearch).toHaveBeenCalledWith('What is AI?');
  });
});
