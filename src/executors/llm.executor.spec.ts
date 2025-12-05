import { Test, TestingModule } from '@nestjs/testing';
import { LLMExecutor } from './llm.executor';
import { LLMService } from '../llm/llm.service';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';

describe('LLMExecutor', () => {
  let executor: LLMExecutor;
  let mockLLMService: jest.Mocked<LLMService>;

  beforeEach(async () => {
    mockLLMService = {
      chat: jest.fn().mockResolvedValue({
        message: { role: 'assistant', content: 'Synthesized response' },
        prompt_eval_count: 100,
        eval_count: 50,
      }),
    } as jest.Mocked<LLMService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMExecutor,
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
      ],
    }).compile();

    executor = module.get<LLMExecutor>(LLMExecutor);
  });

  describe('execute', () => {
    it('should execute LLM call and return result with token usage', async () => {
      const step: PlanStep = {
        id: 'step-1',
        phaseId: 'phase-1',
        type: 'llm_call',
        toolName: 'synthesize',
        config: {
          prompt: 'Summarize the following',
          context: 'Some context data',
          systemPrompt: 'You are a helpful assistant',
        },
        dependencies: [],
        status: 'pending',
        order: 0,
      };

      const result = await executor.execute(step);

      expect(result.output).toBe('Synthesized response');
      expect(result.tokensUsed).toEqual({
        prompt: 100,
        completion: 50,
        total: 150,
      });
    });

    it('should handle LLM errors gracefully', async () => {
      const testError = new Error('LLM service unavailable');
      mockLLMService.chat.mockRejectedValue(testError);

      const step: PlanStep = {
        id: 'step-1',
        phaseId: 'phase-1',
        type: 'llm_call',
        toolName: 'synthesize',
        config: { prompt: 'Test prompt' },
        dependencies: [],
        status: 'pending',
        order: 0,
      };

      const result = await executor.execute(step);

      expect(result.error).toBeDefined();
      expect(testError.message).toBe('LLM service unavailable');
    });

    it('should work without optional systemPrompt and context', async () => {
      const step: PlanStep = {
        id: 'step-1',
        phaseId: 'phase-1',
        type: 'llm_call',
        toolName: 'synthesize',
        config: { prompt: 'Simple prompt' },
        dependencies: [],
        status: 'pending',
        order: 0,
      };

      const result = await executor.execute(step);

      expect(result.output).toBe('Synthesized response');
      // Should have called with just the user message
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLLMService.chat).toHaveBeenCalledWith([
        { role: 'user', content: 'Simple prompt' },
      ]);
    });
  });
});
