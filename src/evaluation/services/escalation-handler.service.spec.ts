import { Test, TestingModule } from '@nestjs/testing';
import { EscalationHandlerService } from './escalation-handler.service';
import { LLMService } from '../../llm/llm.service';
import { DEFAULT_EVALUATION_CONFIG } from '../interfaces';

describe('EscalationHandlerService', () => {
  let service: EscalationHandlerService;
  let mockLLMService: any;

  beforeEach(async () => {
    mockLLMService = {
      chat: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationHandlerService,
        { provide: LLMService, useValue: mockLLMService },
      ],
    }).compile();

    service = module.get<EscalationHandlerService>(EscalationHandlerService);
  });

  describe('escalate', () => {
    it('should call larger model and return meta-evaluation', async () => {
      mockLLMService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            trustDecisions: {
              intentAnalyst: { trustScore: 0.9, reasoning: 'Well reasoned' },
            },
            resolvedScores: { intentAlignment: 0.75 },
            finalVerdict: 'pass',
            overallConfidence: 0.85,
            synthesis: 'Panel was mostly correct',
            recommendations: [],
          }),
        },
      });

      const result = await service.escalate({
        trigger: 'borderline',
        query: 'test query',
        content: { plan: 'test plan' },
        panelResults: [
          {
            role: 'intentAnalyst',
            scores: { intentAlignment: 0.68 },
            confidence: 0.8,
            critique: 'Close to threshold',
          },
        ],
      });

      expect(result.finalVerdict).toBe('pass');
      expect(result.scores.intentAlignment).toBe(0.75);
      expect(mockLLMService.chat).toHaveBeenCalledWith(
        expect.any(Array),
        [],
        'qwen3:30b', // Escalation model
      );
    });

    it('should use escalation model from config', async () => {
      mockLLMService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            trustDecisions: {},
            resolvedScores: {},
            finalVerdict: 'fail',
            overallConfidence: 0.9,
            synthesis: 'Failed evaluation',
            recommendations: ['Fix issues'],
          }),
        },
      });

      await service.escalate({
        trigger: 'low_confidence',
        query: 'test',
        content: {},
        panelResults: [],
      });

      expect(mockLLMService.chat).toHaveBeenCalledWith(
        expect.any(Array),
        [],
        DEFAULT_EVALUATION_CONFIG.escalationModel,
      );
    });

    it('should handle parse errors gracefully', async () => {
      mockLLMService.chat.mockResolvedValue({
        message: { content: 'not valid json' },
      });

      const result = await service.escalate({
        trigger: 'disagreement',
        query: 'test',
        content: {},
        panelResults: [],
      });

      expect(result.finalVerdict).toBe('fail'); // Conservative on parse error
      expect(result.trigger).toBe('disagreement');
      expect(result.model).toBe(DEFAULT_EVALUATION_CONFIG.escalationModel);
    });
  });
});
