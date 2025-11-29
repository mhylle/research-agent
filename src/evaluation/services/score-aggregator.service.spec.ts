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

  describe('checkDimensionThresholds', () => {
    it('should pass when no thresholds are provided', () => {
      const scores = { queryAccuracy: 0.4, queryCoverage: 0.5 };
      const result = service.checkDimensionThresholds(scores);

      expect(result.passed).toBe(true);
      expect(result.failingDimensions).toEqual([]);
    });

    it('should pass when all dimensions meet thresholds', () => {
      const scores = {
        queryAccuracy: 0.7,
        queryCoverage: 0.8,
        intentAlignment: 0.75,
      };
      const thresholds = {
        queryAccuracy: 0.6,
        queryCoverage: 0.6,
        intentAlignment: 0.6,
      };

      const result = service.checkDimensionThresholds(scores, thresholds);

      expect(result.passed).toBe(true);
      expect(result.failingDimensions).toEqual([]);
    });

    it('should fail when one dimension is below threshold', () => {
      const scores = {
        queryAccuracy: 0.4,
        queryCoverage: 0.8,
        intentAlignment: 0.75,
      };
      const thresholds = {
        queryAccuracy: 0.6,
        queryCoverage: 0.6,
        intentAlignment: 0.6,
      };

      const result = service.checkDimensionThresholds(scores, thresholds);

      expect(result.passed).toBe(false);
      expect(result.failingDimensions).toHaveLength(1);
      expect(result.failingDimensions[0]).toContain('queryAccuracy');
      expect(result.failingDimensions[0]).toContain('0.40');
    });

    it('should fail when multiple dimensions are below threshold', () => {
      const scores = {
        queryAccuracy: 0.4,
        queryCoverage: 0.5,
        intentAlignment: 0.75,
      };
      const thresholds = {
        queryAccuracy: 0.6,
        queryCoverage: 0.6,
        intentAlignment: 0.6,
      };

      const result = service.checkDimensionThresholds(scores, thresholds);

      expect(result.passed).toBe(false);
      expect(result.failingDimensions).toHaveLength(2);
    });

    it('should only check dimensions that have thresholds', () => {
      const scores = {
        queryAccuracy: 0.4,
        queryCoverage: 0.8,
        unknownDimension: 0.1, // This dimension has no threshold
      };
      const thresholds = {
        queryAccuracy: 0.6,
        queryCoverage: 0.6,
      };

      const result = service.checkDimensionThresholds(scores, thresholds);

      expect(result.passed).toBe(false);
      expect(result.failingDimensions).toHaveLength(1);
      expect(result.failingDimensions[0]).toContain('queryAccuracy');
    });

    it('should handle missing score dimensions gracefully', () => {
      const scores = {
        queryAccuracy: 0.8,
        // queryCoverage is missing
      };
      const thresholds = {
        queryAccuracy: 0.6,
        queryCoverage: 0.6,
      };

      const result = service.checkDimensionThresholds(scores, thresholds);

      // Should pass since we only check dimensions that exist in scores
      expect(result.passed).toBe(true);
      expect(result.failingDimensions).toEqual([]);
    });
  });
});
