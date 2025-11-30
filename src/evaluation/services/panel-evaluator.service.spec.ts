import { Test, TestingModule } from '@nestjs/testing';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { OllamaService } from '../../llm/ollama.service';

describe('PanelEvaluatorService', () => {
  let service: PanelEvaluatorService;
  let mockOllamaService: any;

  beforeEach(async () => {
    mockOllamaService = {
      chat: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PanelEvaluatorService,
        {
          provide: OllamaService,
          useValue: mockOllamaService,
        },
      ],
    }).compile();

    service = module.get<PanelEvaluatorService>(PanelEvaluatorService);
  });

  describe('evaluateWithRole', () => {
    it('should call LLM and parse JSON response', async () => {
      const mockResponse = {
        message: {
          content: JSON.stringify({
            scores: { intentAlignment: 0.85 },
            confidence: 0.9,
            critique: 'Good alignment',
          }),
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test query',
        plan: {},
      });

      expect(result.scores.intentAlignment).toBe(0.85);
      expect(result.confidence).toBe(0.9);
      expect(result.role).toBe('intentAnalyst');
    });

    it('should return low confidence on parse error', async () => {
      mockOllamaService.chat.mockResolvedValue({
        message: { content: 'not valid json' },
      });

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('evaluateWithPanel', () => {
    it('should run multiple evaluators in parallel', async () => {
      mockOllamaService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            scores: { test: 0.8 },
            confidence: 0.9,
            critique: 'Good',
          }),
        },
      });

      const results = await service.evaluateWithPanel(
        ['intentAnalyst', 'coverageChecker'],
        { query: 'test', plan: {} },
      );

      expect(results).toHaveLength(2);
      expect(mockOllamaService.chat).toHaveBeenCalledTimes(2);
    });
  });
});
