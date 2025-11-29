import { Test, TestingModule } from '@nestjs/testing';
import { ScoreAggregatorService } from './score-aggregator.service';

describe('ScoreAggregatorService', () => {
  let service: ScoreAggregatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoreAggregatorService],
    }).compile();

    service = module.get<ScoreAggregatorService>(ScoreAggregatorService);
  });

  describe('aggregateScores', () => {
    it('should weight scores by confidence', () => {
      const results = [
        {
          role: 'intentAnalyst',
          scores: { intentAlignment: 0.8 },
          confidence: 0.9,
        },
        {
          role: 'coverageChecker',
          scores: { queryCoverage: 0.6 },
          confidence: 0.5,
        },
      ];

      const aggregated = service.aggregateScores(results as any);

      // Higher confidence should have more weight
      expect(aggregated.scores.intentAlignment).toBeCloseTo(0.8);
      expect(aggregated.scores.queryCoverage).toBeCloseTo(0.6);
    });

    it('should calculate overall confidence', () => {
      const results = [
        { scores: { a: 0.8 }, confidence: 0.9 },
        { scores: { b: 0.7 }, confidence: 0.7 },
      ];

      const aggregated = service.aggregateScores(results as any);

      expect(aggregated.confidence).toBeGreaterThan(0.7);
      expect(aggregated.confidence).toBeLessThan(1.0);
    });
  });

  describe('checkEscalationTriggers', () => {
    it('should trigger on low confidence', () => {
      const result = {
        scores: { test: 0.7 },
        confidence: 0.4,
      };

      const trigger = service.checkEscalationTriggers(result, [
        { confidence: 0.4 },
        { confidence: 0.5 },
      ] as any);

      expect(trigger).toBe('low_confidence');
    });

    it('should trigger on high disagreement', () => {
      const result = { scores: { test: 0.7 }, confidence: 0.8 };

      const trigger = service.checkEscalationTriggers(result, [
        { scores: { test: 0.9 }, confidence: 0.8 },
        { scores: { test: 0.4 }, confidence: 0.8 },
      ] as any);

      expect(trigger).toBe('disagreement');
    });

    it('should trigger on borderline score', () => {
      const result = { scores: { test: 0.68 }, confidence: 0.8 };

      const trigger = service.checkEscalationTriggers(result, [], 0.7);

      expect(trigger).toBe('borderline');
    });

    it('should return null when no trigger', () => {
      const result = { scores: { test: 0.9 }, confidence: 0.9 };

      const trigger = service.checkEscalationTriggers(
        result,
        [{ scores: { test: 0.85 }, confidence: 0.9 }] as any,
        0.7,
      );

      expect(trigger).toBeNull();
    });
  });
});
