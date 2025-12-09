import { Test, TestingModule } from '@nestjs/testing';
import { EscalationHandlerService } from './escalation-handler.service';
import { LLMService } from '../../llm/llm.service';
import { DEFAULT_EVALUATION_CONFIG } from '../interfaces';

describe('EscalationHandlerService', () => {
  let service: EscalationHandlerService;
  let mockLLMService: any;

  describe('with Ollama provider', () => {
    beforeEach(async () => {
      mockLLMService = {
        chat: jest.fn(),
        getProviderName: jest.fn().mockReturnValue('ollama'),
        getProviderInfo: jest.fn().mockReturnValue({
          name: 'ollama',
          model: 'qwen2.5',
          supportedFeatures: ['chat'],
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EscalationHandlerService,
          { provide: LLMService, useValue: mockLLMService },
        ],
      }).compile();

      service = module.get<EscalationHandlerService>(EscalationHandlerService);
    });

    it('should call escalation model and return meta-evaluation', async () => {
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
        DEFAULT_EVALUATION_CONFIG.escalationModel, // Ollama uses config model
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

  describe('with Azure Mistral provider', () => {
    beforeEach(async () => {
      mockLLMService = {
        chat: jest.fn(),
        getProviderName: jest.fn().mockReturnValue('azure-mistral'),
        getProviderInfo: jest.fn().mockReturnValue({
          name: 'azure-mistral',
          model: 'Mistral-Large-3',
          supportedFeatures: ['chat'],
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EscalationHandlerService,
          { provide: LLMService, useValue: mockLLMService },
        ],
      }).compile();

      service = module.get<EscalationHandlerService>(EscalationHandlerService);
    });

    it('should use provider default model (no model override)', async () => {
      mockLLMService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            trustDecisions: {},
            resolvedScores: { intentAlignment: 0.8 },
            finalVerdict: 'pass',
            overallConfidence: 0.9,
            synthesis: 'Evaluation passed',
            recommendations: [],
          }),
        },
      });

      const result = await service.escalate({
        trigger: 'borderline',
        query: 'test query',
        content: {},
        panelResults: [],
      });

      expect(result.finalVerdict).toBe('pass');
      expect(mockLLMService.chat).toHaveBeenCalledWith(
        expect.any(Array),
        [],
        undefined, // Azure uses provider default (no model override)
      );
    });

    it('should report provider model name in result', async () => {
      mockLLMService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            trustDecisions: {},
            resolvedScores: {},
            finalVerdict: 'fail',
            overallConfidence: 0.7,
            synthesis: 'Failed',
            recommendations: [],
          }),
        },
      });

      const result = await service.escalate({
        trigger: 'disagreement',
        query: 'test',
        content: {},
        panelResults: [],
      });

      expect(result.model).toBe('Mistral-Large-3'); // Reports actual provider model
    });
  });
});
