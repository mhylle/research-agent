import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ResearchLogger } from '../../src/logging/research-logger.service';

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

  it('should sanitize large outputs', () => {
    const largeData = 'a'.repeat(15000);
    const result = service['sanitize'](largeData);
    expect(result.length).toBeLessThan(10100);
    expect(result).toContain('[truncated]');
  });
});
