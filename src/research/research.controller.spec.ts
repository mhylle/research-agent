import { Test, TestingModule } from '@nestjs/testing';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { ResearchQueryDto } from './dto/research-query.dto';

describe('ResearchController', () => {
  let controller: ResearchController;
  let service: jest.Mocked<ResearchService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResearchController],
      providers: [
        {
          provide: ResearchService,
          useValue: {
            executeResearch: jest.fn(),
            startResearchInBackground: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ResearchController>(ResearchController);
    service = module.get(ResearchService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should execute research query', async () => {
    const dto: ResearchQueryDto = {
      query: 'What is AI?',
      maxSources: 5,
    };

    const result = await controller.query(dto);

    expect(result.logId).toBeDefined();
    expect(service.startResearchInBackground).toHaveBeenCalledWith(
      'What is AI?',
      expect.any(String),
    );
  });
});
