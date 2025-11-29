import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EvaluationService } from './evaluation.service';
import { EvaluationRecordEntity } from '../entities/evaluation-record.entity';

describe('EvaluationService', () => {
  let service: EvaluationService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      save: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvaluationService,
        {
          provide: getRepositoryToken(EvaluationRecordEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<EvaluationService>(EvaluationService);
  });

  describe('evaluateWithFallback', () => {
    it('should return fallback when evaluation is disabled', async () => {
      const fallback = { passed: true, scores: {}, evaluationSkipped: true };

      // Disable evaluation
      service['config'] = { enabled: false } as any;

      const result = await service.evaluateWithFallback(
        async () => ({ passed: false, scores: {}, evaluationSkipped: false }),
        fallback,
        'test-context',
      );

      expect(result).toEqual(fallback);
    });

    it('should return evaluation result when successful', async () => {
      const expected = {
        passed: true,
        scores: { test: 0.8 },
        evaluationSkipped: false,
      };

      const result = await service.evaluateWithFallback(
        async () => expected,
        { passed: true, scores: {}, evaluationSkipped: true },
        'test-context',
      );

      expect(result).toEqual(expected);
    });

    it('should return fallback with skipReason when evaluation throws', async () => {
      const fallback = { passed: true, scores: {}, evaluationSkipped: true };

      const result = await service.evaluateWithFallback(
        async () => {
          throw new Error('Model unavailable');
        },
        fallback,
        'test-context',
      );

      expect(result.evaluationSkipped).toBe(true);
      expect(result.skipReason).toBe('Model unavailable');
    });

    it('should return fallback when evaluation times out', async () => {
      const fallback = { passed: true, scores: {}, evaluationSkipped: true };

      // Set a very short timeout
      service['config'] = {
        enabled: true,
        planEvaluation: { timeout: 50 },
      } as any;

      const result = await service.evaluateWithFallback(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { passed: false, scores: {}, evaluationSkipped: false };
        },
        fallback,
        'test-context-plan',
      );

      expect(result.evaluationSkipped).toBe(true);
      expect(result.skipReason).toContain('timeout');
    });
  });
});
