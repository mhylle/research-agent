import { Test, TestingModule } from '@nestjs/testing';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

describe('LogsController', () => {
  let controller: LogsController;
  let service: LogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LogsController],
      providers: [
        {
          provide: LogsService,
          useValue: {
            getAllSessions: jest.fn(),
            getSessionDetails: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LogsController>(LogsController);
    service = module.get<LogsService>(LogsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return sessions', async () => {
    const mockResult = {
      sessions: [
        {
          logId: 'test',
          query: 'test query',
          timestamp: '',
          totalDuration: 1000,
          stageCount: 3,
          toolCallCount: 2,
          status: 'completed' as const,
        },
      ],
      total: 1,
    };

    jest.spyOn(service, 'getAllSessions').mockResolvedValue(mockResult);

    const result = await controller.getSessions({});

    expect(result).toEqual(mockResult);
    expect(service.getAllSessions).toHaveBeenCalledWith({});
  });

  it('should return session details', async () => {
    const mockDetail = {
      logId: 'test',
      query: 'test query',
      timestamp: '',
      totalDuration: 1000,
      status: 'completed' as const,
      entries: [],
    };

    jest.spyOn(service, 'getSessionDetails').mockResolvedValue(mockDetail);

    const result = await controller.getSessionDetails('test');

    expect(result).toEqual(mockDetail);
    expect(service.getSessionDetails).toHaveBeenCalledWith('test');
  });
});
