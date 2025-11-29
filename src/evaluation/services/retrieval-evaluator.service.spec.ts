import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalEvaluatorService } from './retrieval-evaluator.service';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { ScoreAggregatorService } from './score-aggregator.service';
import { ResultClassifierService } from './result-classifier.service';

describe('RetrievalEvaluatorService', () => {
  let service: RetrievalEvaluatorService;
  let mockPanelEvaluator: any;
  let mockScoreAggregator: any;
  let mockResultClassifier: any;

  beforeEach(async () => {
    mockPanelEvaluator = {
      evaluateWithRole: jest.fn(),
      evaluateWithPanel: jest.fn(),
    };

    mockScoreAggregator = {
      aggregateScores: jest.fn(),
      calculateOverallScore: jest.fn(),
    };

    mockResultClassifier = {
      classifyBatch: jest.fn(),
      getAggregateStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalEvaluatorService,
        { provide: PanelEvaluatorService, useValue: mockPanelEvaluator },
        { provide: ScoreAggregatorService, useValue: mockScoreAggregator },
        { provide: ResultClassifierService, useValue: mockResultClassifier },
      ],
    }).compile();

    service = module.get<RetrievalEvaluatorService>(RetrievalEvaluatorService);
  });

  describe('evaluate', () => {
    it('should evaluate retrieval and return scores', async () => {
      mockResultClassifier.classifyBatch.mockReturnValue([
        {
          type: 'SPECIFIC_CONTENT',
          actionableInformationScore: 0.85,
          confidence: 0.9,
          reasons: [],
        },
      ]);

      mockResultClassifier.getAggregateStats.mockReturnValue({
        averageActionableScore: 0.85,
        aggregatorCount: 0,
        specificContentCount: 1,
        navigationCount: 0,
        overallConfidence: 0.9,
        needsExtraction: false,
      });

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
      expect(result.scores.actionableInformation).toBe(0.85);
      expect(result.flaggedSevere).toBe(false);
      expect(result.needsExtraction).toBe(false);
    });

    it('should flag severe failures when score < 0.5', async () => {
      mockResultClassifier.classifyBatch.mockReturnValue([]);
      mockResultClassifier.getAggregateStats.mockReturnValue({
        averageActionableScore: 0.0,
        aggregatorCount: 0,
        specificContentCount: 0,
        navigationCount: 0,
        overallConfidence: 0.0,
        needsExtraction: false,
      });

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

    it('should detect aggregator pages and suggest extraction', async () => {
      mockResultClassifier.classifyBatch.mockReturnValue([
        {
          type: 'AGGREGATOR',
          actionableInformationScore: 0.2,
          confidence: 0.85,
          reasons: ['URL patterns indicate aggregator'],
        },
        {
          type: 'AGGREGATOR',
          actionableInformationScore: 0.15,
          confidence: 0.9,
          reasons: ['High link density'],
        },
      ]);

      mockResultClassifier.getAggregateStats.mockReturnValue({
        averageActionableScore: 0.175,
        aggregatorCount: 2,
        specificContentCount: 0,
        navigationCount: 0,
        overallConfidence: 0.875,
        needsExtraction: true,
      });

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          role: 'sourceRelevance',
          scores: { contextRecall: 0.5, contextPrecision: 0.5 },
          confidence: 0.8,
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { contextRecall: 0.5, contextPrecision: 0.5 },
        confidence: 0.8,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.45);

      const result = await service.evaluate({
        query: 'events in Aarhus today',
        retrievedContent: [
          {
            url: 'https://eventbrite.com/d/denmark--århus/events',
            content: 'Event 1, Event 2, Event 3',
            title: 'All Events in Aarhus',
          },
          {
            url: 'https://allevents.in/aarhus',
            content: 'Browse events',
            title: 'Find Events',
          },
        ],
      });

      expect(result.needsExtraction).toBe(true);
      expect(result.extractionReason).toContain('aggregator pages');
      expect(result.scores.actionableInformation).toBe(0.175);
      expect(result.sourceDetails[0].resultType).toBe('AGGREGATOR');
      expect(result.sourceDetails[0].actionableScore).toBe(0.2);
    });
  });
});
