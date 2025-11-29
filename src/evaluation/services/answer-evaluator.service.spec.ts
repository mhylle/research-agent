import { Test, TestingModule } from '@nestjs/testing';
import { AnswerEvaluatorService } from './answer-evaluator.service';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { ScoreAggregatorService } from './score-aggregator.service';

describe('AnswerEvaluatorService', () => {
  let service: AnswerEvaluatorService;
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
        AnswerEvaluatorService,
        { provide: PanelEvaluatorService, useValue: mockPanelEvaluator },
        { provide: ScoreAggregatorService, useValue: mockScoreAggregator },
      ],
    }).compile();

    service = module.get<AnswerEvaluatorService>(AnswerEvaluatorService);
  });

  describe('evaluate', () => {
    it('should evaluate answer and return scores', async () => {
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          role: 'faithfulnessJudge',
          scores: { faithfulness: 0.85 },
          confidence: 0.9,
        },
        { role: 'intentAnalyst', scores: { relevance: 0.8 }, confidence: 0.85 },
        {
          role: 'factChecker',
          scores: { factualAccuracy: 0.9 },
          confidence: 0.95,
        },
        {
          role: 'coverageChecker',
          scores: { completeness: 0.75 },
          confidence: 0.8,
        },
        {
          role: 'qualityAssessor',
          scores: { coherence: 0.85 },
          confidence: 0.9,
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          faithfulness: 0.85,
          relevance: 0.8,
          factualAccuracy: 0.9,
          completeness: 0.75,
          coherence: 0.85,
        },
        confidence: 0.88,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.84);

      const result = await service.evaluate({
        query: 'test query',
        answer: 'This is the generated answer',
        sources: [{ url: 'http://test.com', content: 'source content' }],
      });

      expect(result.passed).toBe(true);
      expect(result.shouldRegenerate).toBe(false);
      expect(result.scores.faithfulness).toBe(0.85);
    });

    it('should recommend regeneration when score < 0.5', async () => {
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          role: 'faithfulnessJudge',
          scores: { faithfulness: 0.3 },
          confidence: 0.9,
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { faithfulness: 0.3 },
        confidence: 0.9,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.3);

      const result = await service.evaluate({
        query: 'test query',
        answer: 'Bad answer',
        sources: [],
      });

      expect(result.passed).toBe(false);
      expect(result.shouldRegenerate).toBe(true);
    });

    it('should include critique for improvement guidance', async () => {
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          role: 'faithfulnessJudge',
          scores: { faithfulness: 0.6 },
          confidence: 0.8,
          critique: 'Some claims lack support',
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { faithfulness: 0.6 },
        confidence: 0.8,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.6);

      const result = await service.evaluate({
        query: 'test query',
        answer: 'Mediocre answer',
        sources: [],
      });

      expect(result.critique).toContain('Some claims lack support');
    });
  });
});
