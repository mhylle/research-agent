import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalEvaluatorService } from '../services/retrieval-evaluator.service';
import { PanelEvaluatorService } from '../services/panel-evaluator.service';
import { ScoreAggregatorService } from '../services/score-aggregator.service';
import {
  createMockRetrievalContent,
  createMockEvaluatorResult,
} from './test-fixtures';

describe('RetrievalEvaluatorService', () => {
  let service: RetrievalEvaluatorService;
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
        RetrievalEvaluatorService,
        { provide: PanelEvaluatorService, useValue: mockPanelEvaluator },
        { provide: ScoreAggregatorService, useValue: mockScoreAggregator },
      ],
    }).compile();

    service = module.get<RetrievalEvaluatorService>(RetrievalEvaluatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluate', () => {
    it('should evaluate retrieval and pass with good scores', async () => {
      const retrievedContent = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('sourceRelevance', { contextRecall: 0.85 }),
        createMockEvaluatorResult('sourceQuality', { sourceQuality: 0.9 }),
        createMockEvaluatorResult('coverageCompleteness', { contextPrecision: 0.8 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          contextRecall: 0.85,
          contextPrecision: 0.8,
          sourceQuality: 0.9,
        },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.85);

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        retrievedContent,
      });

      expect(result.passed).toBe(true);
      expect(result.flaggedSevere).toBe(false);
      expect(result.scores).toEqual({
        contextRecall: 0.85,
        contextPrecision: 0.8,
        sourceQuality: 0.9,
      });
      expect(result.confidence).toBe(0.85);
      expect(result.evaluationSkipped).toBe(false);
    });

    it('should flag severe failure when overall score is below threshold', async () => {
      const retrievedContent = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('sourceRelevance', { contextRecall: 0.3 }),
        createMockEvaluatorResult('sourceQuality', { sourceQuality: 0.4 }),
        createMockEvaluatorResult('coverageCompleteness', { contextPrecision: 0.35 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          contextRecall: 0.3,
          contextPrecision: 0.35,
          sourceQuality: 0.4,
        },
        confidence: 0.8,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.35); // Below 0.5 threshold

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        retrievedContent,
      });

      expect(result.passed).toBe(false);
      expect(result.flaggedSevere).toBe(true);
      expect(result.scores.contextRecall).toBe(0.3);
      expect(result.scores.contextPrecision).toBe(0.35);
      expect(result.scores.sourceQuality).toBe(0.4);
    });

    it('should include source details in evaluation result', async () => {
      const retrievedContent = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('sourceRelevance', { contextRecall: 0.85 }),
        createMockEvaluatorResult('sourceQuality', { sourceQuality: 0.9 }),
        createMockEvaluatorResult('coverageCompleteness', { contextPrecision: 0.8 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          contextRecall: 0.85,
          contextPrecision: 0.8,
          sourceQuality: 0.9,
        },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.85);

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        retrievedContent,
      });

      expect(result.sourceDetails).toBeDefined();
      expect(result.sourceDetails.length).toBeGreaterThan(0);
      expect(result.sourceDetails[0]).toHaveProperty('url');
      expect(result.sourceDetails[0]).toHaveProperty('relevanceScore');
      expect(result.sourceDetails[0]).toHaveProperty('qualityScore');
    });

    it('should call panel evaluator with correct evaluator roles', async () => {
      const retrievedContent = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('sourceRelevance', { contextRecall: 0.85 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { contextRecall: 0.85 },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.85);

      await service.evaluate({
        query: 'What is quantum computing?',
        retrievedContent,
      });

      expect(mockPanelEvaluator.evaluateWithPanel).toHaveBeenCalledWith(
        ['sourceRelevance', 'sourceQuality', 'coverageCompleteness'],
        expect.objectContaining({
          query: 'What is quantum computing?',
          sources: expect.any(String),
        }),
      );
    });

    it('should format sources correctly for evaluation', async () => {
      const retrievedContent = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('sourceRelevance', { contextRecall: 0.85 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { contextRecall: 0.85 },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.85);

      await service.evaluate({
        query: 'What is quantum computing?',
        retrievedContent,
      });

      const callArgs = mockPanelEvaluator.evaluateWithPanel.mock.calls[0][1];
      expect(callArgs.sources).toContain('https://example.com/quantum-basics');
      expect(callArgs.sources).toContain('Quantum Computing Basics');
    });

    it('should handle evaluation errors gracefully and skip evaluation', async () => {
      const retrievedContent = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockRejectedValue(
        new Error('LLM service unavailable'),
      );

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        retrievedContent,
      });

      expect(result.passed).toBe(true); // Fail-safe: don't block on evaluation failure
      expect(result.evaluationSkipped).toBe(true);
      expect(result.skipReason).toBe('LLM service unavailable');
      expect(result.scores).toEqual({
        contextRecall: 0,
        contextPrecision: 0,
        sourceQuality: 0,
      });
      expect(result.confidence).toBe(0);
    });

    it('should handle empty retrieved content', async () => {
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('sourceRelevance', { contextRecall: 0 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { contextRecall: 0 },
        confidence: 0.9,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0);

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        retrievedContent: [],
      });

      expect(result.passed).toBe(false); // 0 score is below threshold
      expect(result.flaggedSevere).toBe(true);
    });

    it('should apply correct weights for score calculation', async () => {
      const retrievedContent = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('sourceRelevance', { contextRecall: 0.8 }),
        createMockEvaluatorResult('sourceQuality', { sourceQuality: 0.9 }),
        createMockEvaluatorResult('coverageCompleteness', { contextPrecision: 0.7 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          contextRecall: 0.8,
          contextPrecision: 0.7,
          sourceQuality: 0.9,
        },
        confidence: 0.85,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.8);

      await service.evaluate({
        query: 'What is quantum computing?',
        retrievedContent,
      });

      expect(mockScoreAggregator.calculateOverallScore).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          contextRecall: expect.any(Number),
          contextPrecision: expect.any(Number),
          sourceQuality: expect.any(Number),
        }),
      );
    });

    it('should pass with borderline score at threshold', async () => {
      const retrievedContent = createMockRetrievalContent();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('sourceRelevance', { contextRecall: 0.5 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { contextRecall: 0.5 },
        confidence: 0.9,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.5); // Exactly at threshold

      const result = await service.evaluate({
        query: 'What is quantum computing?',
        retrievedContent,
      });

      expect(result.passed).toBe(true); // >= threshold should pass
      expect(result.flaggedSevere).toBe(false);
    });
  });
});
