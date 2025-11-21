import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LogsService } from './logs.service';
import * as fs from 'fs/promises';

jest.mock('fs/promises');

describe('LogsService', () => {
  let service: LogsService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'LOG_DIR') return './logs';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LogsService>(LogsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should parse log file and return sessions', async () => {
    const mockLogContent = `{"timestamp":"2025-11-20T10:00:00.000Z","logId":"test-123","stage":1,"component":"pipeline","operation":"stage_input","input":{"query":"test query"},"level":"info","message":"Stage input"}
{"timestamp":"2025-11-20T10:00:15.000Z","logId":"test-123","stage":1,"component":"pipeline","operation":"stage_output","executionTime":15000,"output":{},"level":"info","message":"Stage output"}`;

    (fs.readFile as jest.Mock).mockResolvedValue(mockLogContent);

    const result = await service.getAllSessions({});

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].logId).toBe('test-123');
    expect(result.sessions[0].query).toBe('test query');
  });
});
