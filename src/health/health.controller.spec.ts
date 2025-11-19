import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { OllamaService } from '../llm/ollama.service';
import { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  let controller: HealthController;
  let ollamaService: jest.Mocked<OllamaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: OllamaService,
          useValue: {
            chat: jest.fn(),
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
    ollamaService = module.get(OllamaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return healthy status when services are up', async () => {
    ollamaService.chat.mockResolvedValue({ message: { role: 'assistant', content: 'test' } } as any);

    const result = await controller.check();

    expect(result.status).toBe('healthy');
    expect(result.services.ollama).toBe(true);
    expect(result.services.tavily).toBe(true);
  });

  it('should return degraded when Ollama is down', async () => {
    ollamaService.chat.mockRejectedValue(new Error('Connection failed'));

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.services.ollama).toBe(false);
  });
});
