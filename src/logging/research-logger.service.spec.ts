import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ResearchLogger } from '../../src/logging/research-logger.service';
import { LogService } from '../../src/logging/log.service';

describe('ResearchLogger', () => {
  let service: ResearchLogger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchLogger,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                LOG_LEVEL: 'info',
                LOG_DIR: './logs',
                NODE_ENV: 'test',
              };
              return config[key];
            }),
          },
        },
        {
          provide: LogService,
          useValue: {
            append: jest.fn().mockResolvedValue({ id: 'log-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<ResearchLogger>(ResearchLogger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should log stage input', () => {
    const logSpy = jest.spyOn(service['logger'], 'info');
    service.logStageInput(1, 'test-log-id', { query: 'test query' });

    expect(logSpy).toHaveBeenCalledWith(
      'Stage input',
      expect.objectContaining({
        logId: 'test-log-id',
        stage: 1,
        component: 'pipeline',
        operation: 'stage_input',
      }),
    );
  });

  it('should not sanitize large outputs', () => {
    const largeData = 'a'.repeat(15000);
    const result = service['sanitize'](largeData);
    // Sanitize no longer truncates - returns data as-is for complete debugging
    expect(result.length).toBe(15000);
    expect(result).toBe(largeData);
  });
});
