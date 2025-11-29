import { Test, TestingModule } from '@nestjs/testing';
import { PlanEvaluationOrchestratorService } from './plan-evaluation-orchestrator.service';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { ScoreAggregatorService } from './score-aggregator.service';
import { EscalationHandlerService } from './escalation-handler.service';
import { EvaluationService } from './evaluation.service';

describe('PlanEvaluationOrchestratorService', () => {
  let service: PlanEvaluationOrchestratorService;
  let mockPanelEvaluator: any;
  let mockScoreAggregator: any;
  let mockEscalationHandler: any;
  let mockEvaluationService: any;

  beforeEach(async () => {
    mockPanelEvaluator = {
      evaluateWithPanel: jest.fn(),
    };

    mockScoreAggregator = {
      aggregateScores: jest.fn(),
      calculateOverallScore: jest.fn(),
      checkEscalationTriggers: jest.fn(),
    };

    mockEscalationHandler = {
      escalate: jest.fn(),
    };

    mockEvaluationService = {
      evaluateWithFallback: jest.fn((fn) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanEvaluationOrchestratorService,
        { provide: PanelEvaluatorService, useValue: mockPanelEvaluator },
        { provide: ScoreAggregatorService, useValue: mockScoreAggregator },
        { provide: EscalationHandlerService, useValue: mockEscalationHandler },
        { provide: EvaluationService, useValue: mockEvaluationService },
      ],
    }).compile();

    service = module.get<PlanEvaluationOrchestratorService>(
      PlanEvaluationOrchestratorService,
    );
  });

  describe('evaluatePlan', () => {
    it('should pass on first attempt when scores are good', async () => {
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          role: 'intentAnalyst',
          scores: { intentAlignment: 0.9 },
          confidence: 0.9,
        },
        {
          role: 'coverageChecker',
          scores: { queryCoverage: 0.85 },
          confidence: 0.85,
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { intentAlignment: 0.9, queryCoverage: 0.85 },
        confidence: 0.87,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.88);
      mockScoreAggregator.checkEscalationTriggers.mockReturnValue(null);

      const result = await service.evaluatePlan({
        query: 'What is quantum computing?',
        plan: { searchQueries: ['quantum computing basics'] },
      });

      expect(result.passed).toBe(true);
      expect(result.totalIterations).toBe(1);
      expect(result.escalatedToLargeModel).toBe(false);
    });

    it('should escalate when trigger is detected', async () => {
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          role: 'intentAnalyst',
          scores: { intentAlignment: 0.68 },
          confidence: 0.5,
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { intentAlignment: 0.68 },
        confidence: 0.5,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.68);
      mockScoreAggregator.checkEscalationTriggers.mockReturnValue('borderline');

      mockEscalationHandler.escalate.mockResolvedValue({
        finalVerdict: 'pass',
        scores: { intentAlignment: 0.72 },
        panelReview: 'Approved after review',
      });

      const result = await service.evaluatePlan({
        query: 'test',
        plan: {},
      });

      expect(result.escalatedToLargeModel).toBe(true);
      expect(mockEscalationHandler.escalate).toHaveBeenCalled();
    });

    it('should iterate up to max attempts on failure', async () => {
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          role: 'intentAnalyst',
          scores: { intentAlignment: 0.4 },
          confidence: 0.9,
          critique: 'Poor alignment',
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { intentAlignment: 0.4 },
        confidence: 0.9,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.4);
      mockScoreAggregator.checkEscalationTriggers.mockReturnValue(null);

      const result = await service.evaluatePlan({
        query: 'test',
        plan: {},
      });

      expect(result.passed).toBe(false);
      expect(result.totalIterations).toBe(3); // Max attempts
      expect(result.attempts).toHaveLength(3);
    });
  });
});
