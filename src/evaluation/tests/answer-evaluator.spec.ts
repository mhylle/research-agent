import { Test, TestingModule } from '@nestjs/testing';
import { AnswerEvaluatorService } from '../services/answer-evaluator.service';
import { PanelEvaluatorService } from '../services/panel-evaluator.service';
import { ScoreAggregatorService } from '../services/score-aggregator.service';
import {
  createMockAnswer,
  createMockRetrievalContent,
  createMockEvaluatorResult,
} from './test-fixtures';

describe('AnswerEvaluatorService', () => {
  let service: AnswerEvaluatorService;
  let mockPanelEvaluator: any;
  let mockScoreAggregator: any;

  beforeEach(async () => {
    mockPanelEvaluator = {
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluate', () => {
    it('should evaluate answer and pass with good scores', async () => {
      const answer = createMockAnswer();
      const sources = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('faithfulness', { faithfulness: 0.9 }),
        createMockEvaluatorResult('answerRelevance', { answerRelevance: 0.85 }),
        createMockEvaluatorResult('answerCompleteness', {
          completeness: 0.8,
          accuracy: 0.85,
        }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          faithfulness: 0.9,
          answerRelevance: 0.85,
          completeness: 0.8,
          accuracy: 0.85,
        },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.85);

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        answer,
        sources,
      });

      expect(result.passed).toBe(true);
      expect(result.shouldRegenerate).toBe(false);
      expect(result.scores).toEqual({
        faithfulness: 0.9,
        answerRelevance: 0.85,
        completeness: 0.8,
        accuracy: 0.85,
      });
      expect(result.confidence).toBe(0.85);
      expect(result.evaluationSkipped).toBe(false);
    });

    it('should flag answer for regeneration when score is below threshold', async () => {
      const answer = createMockAnswer();
      const sources = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('faithfulness', { faithfulness: 0.3 }),
        createMockEvaluatorResult('answerRelevance', { answerRelevance: 0.4 }),
        createMockEvaluatorResult('answerCompleteness', {
          completeness: 0.35,
          accuracy: 0.3,
        }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          faithfulness: 0.3,
          answerRelevance: 0.4,
          completeness: 0.35,
          accuracy: 0.3,
        },
        confidence: 0.8,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.35); // Below 0.5 threshold

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        answer,
        sources,
      });

      expect(result.passed).toBe(false);
      expect(result.shouldRegenerate).toBe(true);
      expect(result.scores.faithfulness).toBe(0.3);
    });

    it('should include critique and improvement suggestions', async () => {
      const answer = createMockAnswer();
      const sources = createMockRetrievalContent();

      const mockCritique = 'Answer lacks technical depth';

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          ...createMockEvaluatorResult('faithfulness', { faithfulness: 0.5 }), // Score below 0.6 to trigger suggestions
          critique: mockCritique,
          suggestions: [],
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { faithfulness: 0.5 },
        confidence: 0.8,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.5);

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        answer,
        sources,
      });

      expect(result.critique).toBeDefined();
      expect(result.critique).toContain(mockCritique);
      expect(result.improvementSuggestions).toBeDefined();
      // Suggestions are auto-generated when scores < 0.6
      expect(result.improvementSuggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should call panel evaluator with correct evaluator roles', async () => {
      const answer = createMockAnswer();
      const sources = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('faithfulness', { faithfulness: 0.85 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { faithfulness: 0.85 },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.85);

      await service.evaluate({
        query: 'What is quantum computing?',
        answer,
        sources,
      });

      expect(mockPanelEvaluator.evaluateWithPanel).toHaveBeenCalledWith(
        ['faithfulness', 'answerRelevance', 'answerCompleteness'],
        expect.objectContaining({
          query: 'What is quantum computing?',
          answer,
          sources: expect.any(String),
        }),
      );
    });

    it('should handle empty answer by skipping evaluation', async () => {
      const sources = createMockRetrievalContent();

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        answer: '',
        sources,
      });

      expect(result.passed).toBe(false);
      expect(result.shouldRegenerate).toBe(true);
      expect(result.evaluationSkipped).toBe(true);
      expect(result.skipReason).toBe('No answer generated');
      expect(result.improvementSuggestions).toContain(
        'Generate a comprehensive answer based on retrieved sources',
      );
    });

    it('should handle whitespace-only answer by skipping evaluation', async () => {
      const sources = createMockRetrievalContent();

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        answer: '   \n  \t  ',
        sources,
      });

      expect(result.passed).toBe(false);
      expect(result.shouldRegenerate).toBe(true);
      expect(result.evaluationSkipped).toBe(true);
      expect(result.skipReason).toBe('No answer generated');
    });

    it('should handle evaluation errors gracefully and skip evaluation', async () => {
      const answer = createMockAnswer();
      const sources = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockRejectedValue(
        new Error('LLM service unavailable'),
      );

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        answer,
        sources,
      });

      expect(result.passed).toBe(true); // Fail-safe: don't block on evaluation failure
      expect(result.evaluationSkipped).toBe(true);
      expect(result.skipReason).toBe('LLM service unavailable');
      expect(result.scores).toEqual({
        faithfulness: 0,
        answerRelevance: 0,
        completeness: 0,
        accuracy: 0,
      });
      expect(result.confidence).toBe(0);
    });

    it('should format sources correctly for evaluation', async () => {
      const answer = createMockAnswer();
      const sources = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('faithfulness', { faithfulness: 0.85 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { faithfulness: 0.85 },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.85);

      await service.evaluate({
        query: 'What is quantum computing?',
        answer,
        sources,
      });

      const callArgs = mockPanelEvaluator.evaluateWithPanel.mock.calls[0][1];
      expect(callArgs.sources).toContain('https://example.com/quantum-basics');
      expect(callArgs.sources).toContain('Quantum Computing Basics');
    });

    it('should apply correct weights for score calculation', async () => {
      const answer = createMockAnswer();
      const sources = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('faithfulness', { faithfulness: 0.9 }),
        createMockEvaluatorResult('answerRelevance', { answerRelevance: 0.85 }),
        createMockEvaluatorResult('answerCompleteness', {
          completeness: 0.8,
          accuracy: 0.85,
        }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          faithfulness: 0.9,
          answerRelevance: 0.85,
          completeness: 0.8,
          accuracy: 0.85,
        },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.85);

      await service.evaluate({
        query: 'What is quantum computing?',
        answer,
        sources,
      });

      expect(mockScoreAggregator.calculateOverallScore).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          faithfulness: expect.any(Number),
          answerRelevance: expect.any(Number),
          completeness: expect.any(Number),
          accuracy: expect.any(Number),
        }),
      );
    });

    it('should pass with borderline score at threshold', async () => {
      const answer = createMockAnswer();
      const sources = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('faithfulness', { faithfulness: 0.5 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { faithfulness: 0.5 },
        confidence: 0.9,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.5); // Exactly at threshold

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        answer,
        sources,
      });

      expect(result.passed).toBe(true); // >= threshold should pass
      expect(result.shouldRegenerate).toBe(false);
    });

    it('should aggregate multiple evaluator critiques', async () => {
      const answer = createMockAnswer();
      const sources = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          ...createMockEvaluatorResult('faithfulness', { faithfulness: 0.7 }),
          critique: 'Needs better source alignment',
        },
        {
          ...createMockEvaluatorResult('answerRelevance', {
            answerRelevance: 0.6,
          }),
          critique: 'Could be more focused on the query',
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { faithfulness: 0.7, answerRelevance: 0.6 },
        confidence: 0.8,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.65);

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        answer,
        sources,
      });

      expect(result.critique).toContain('Needs better source alignment');
      expect(result.critique).toContain('Could be more focused on the query');
    });
  });
});
