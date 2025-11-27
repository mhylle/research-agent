import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LogsService } from './logs.service';
import { LogEntryEntity } from '../logging/entities/log-entry.entity';
import { ResearchResultEntity } from '../research/entities/research-result.entity';

describe('LogsService', () => {
  let service: LogsService;
  let mockLogRepository: any;
  let mockResultRepository: any;

  beforeEach(async () => {
    mockLogRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
      find: jest.fn().mockResolvedValue([]),
    };

    mockResultRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogsService,
        {
          provide: getRepositoryToken(LogEntryEntity),
          useValue: mockLogRepository,
        },
        {
          provide: getRepositoryToken(ResearchResultEntity),
          useValue: mockResultRepository,
        },
      ],
    }).compile();

    service = module.get<LogsService>(LogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get all sessions from repository', async () => {
    // Mock the repository to return log entries
    const mockLogEntries = [
      {
        id: 1,
        logId: 'test-123',
        timestamp: new Date('2025-11-20T10:00:00.000Z'),
        eventType: 'session_started',
        data: { query: 'test query' },
      },
      {
        id: 2,
        logId: 'test-123',
        timestamp: new Date('2025-11-20T10:00:15.000Z'),
        eventType: 'session_completed',
        data: {},
      },
    ];

    mockLogRepository.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ logId: 'test-123' }]),
    });

    mockLogRepository.find.mockResolvedValue(mockLogEntries);

    const result = await service.getAllSessions({});

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].logId).toBe('test-123');
    expect(result.sessions[0].query).toBe('test query');
  });
});
