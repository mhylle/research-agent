import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalEvaluatorService } from './retrieval-evaluator.service';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { ScoreAggregatorService } from './score-aggregator.service';

describe('RetrievalEvaluatorService', () => {
  let service: RetrievalEvaluatorService;
  let mockPanelEvaluator: any;
  let mockScoreAggregator: any;

  beforeEach(async () => {
    mockPanelEvaluator = {
      evaluateWithRole: jest.fn(),
      evaluateWithPanel: jest.fn(),
    };

    mockScoreAggregator = {
      aggregateScores: jest.fn(),
      calculateOverallScore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalEvaluatorService,
        { provide: PanelEvaluatorService, useValue: mockPanelEvaluator },
        { provide: ScoreAggregatorService, useValue: mockScoreAggregator },
      ],
    }).compile();

    service = module.get<RetrievalEvaluatorService>(RetrievalEvaluatorService);
  });

  describe('evaluate', () => {
    it('should evaluate retrieval and return scores', async () => {
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          role: 'faithfulnessJudge',
          scores: { contextPrecision: 0.8 },
          confidence: 0.9,
        },
        {
          role: 'coverageChecker',
          scores: { contextRecall: 0.7 },
          confidence: 0.85,
        },
        {
          role: 'qualityAssessor',
          scores: { sourceQuality: 0.75 },
          confidence: 0.8,
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          contextRecall: 0.7,
          contextPrecision: 0.8,
          sourceQuality: 0.75,
        },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.75);

      const result = await service.evaluate({
        query: 'test query',
        retrievedContent: [{ url: 'http://test.com', content: 'test content' }],
      });

      expect(result.passed).toBe(true);
      expect(result.scores.contextRecall).toBe(0.7);
      expect(result.flaggedSevere).toBe(false);
    });

    it('should flag severe failures when score < 0.5', async () => {
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          role: 'faithfulnessJudge',
          scores: { contextPrecision: 0.3 },
          confidence: 0.9,
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { contextPrecision: 0.3 },
        confidence: 0.9,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.3);

      const result = await service.evaluate({
        query: 'test query',
        retrievedContent: [],
      });

      expect(result.passed).toBe(false);
      expect(result.flaggedSevere).toBe(true);
    });
  });
});
