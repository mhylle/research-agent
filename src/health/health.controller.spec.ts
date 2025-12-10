import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { LLMService } from '../llm/llm.service';
import { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  let controller: HealthController;
  let llmService: jest.Mocked<LLMService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: LLMService,
          useValue: {
            chat: jest.fn(),
            getProviderName: jest.fn().mockReturnValue('ollama'),
            getProviderInfo: jest.fn().mockReturnValue({
              name: 'ollama',
              model: 'qwen2.5',
              supportedFeatures: ['chat'],
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-key'),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    llmService = module.get(LLMService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return healthy status when services are up', async () => {
    llmService.chat.mockResolvedValue({
      message: { role: 'assistant', content: 'test' },
    } as any);

    const result = await controller.check();

    expect(result.status).toBe('healthy');
    expect(result.services.ollama).toBe(true);
    expect(result.services.tavily).toBe(true);
  });

  it('should return degraded when Ollama is down', async () => {
    llmService.chat.mockRejectedValue(new Error('Connection failed'));

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.services.ollama).toBe(false);
  });
});
