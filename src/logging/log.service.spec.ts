import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LogService } from './log.service';
import { LogEntryEntity } from './entities/log-entry.entity';
import { CreateLogEntry } from './interfaces/log-entry.interface';

describe('LogService', () => {
  let service: LogService;
  let mockRepository: any;
  let mockEventEmitter: any;

  beforeEach(async () => {
    mockRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogService,
        {
          provide: getRepositoryToken(LogEntryEntity),
          useValue: mockRepository,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<LogService>(LogService);
  });

  describe('append', () => {
    it('should create a log entry with generated id', async () => {
      const entry: CreateLogEntry = {
        logId: 'test-log-id',
        timestamp: new Date(),
        eventType: 'session_started',
        data: { query: 'test query' },
      };

      const result = await service.append(entry);

      expect(result.id).toBeDefined();
      expect(result.logId).toBe(entry.logId);
      expect(result.eventType).toBe(entry.eventType);
      expect(mockRepository.insert).toHaveBeenCalled();
    });

    it('should emit events for real-time streaming', async () => {
      const entry: CreateLogEntry = {
        logId: 'test-log-id',
        timestamp: new Date(),
        eventType: 'step_started',
        data: {},
      };

      await service.append(entry);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        `log.${entry.logId}`,
        expect.any(Object),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'log.all',
        expect.any(Object),
      );
    });
  });

  describe('getSessionLogs', () => {
    it('should return logs ordered by timestamp', async () => {
      const logs = [
        {
          id: '1',
          logId: 'test',
          timestamp: new Date(),
          eventType: 'session_started',
          data: {},
        },
      ];
      mockRepository.find.mockResolvedValue(logs);

      const result = await service.getSessionLogs('test');

      expect(result).toEqual(logs);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { logId: 'test' },
        order: { timestamp: 'ASC' },
      });
    });
  });
});
