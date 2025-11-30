import { Test, TestingModule } from '@nestjs/testing';
import { PlanEvaluationOrchestratorService } from '../services/plan-evaluation-orchestrator.service';
import { PanelEvaluatorService } from '../services/panel-evaluator.service';
import { ScoreAggregatorService } from '../services/score-aggregator.service';
import { EscalationHandlerService } from '../services/escalation-handler.service';
import { EvaluationService } from '../services/evaluation.service';
import { createMockPlan, createMockEvaluatorResult } from './test-fixtures';

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
      checkDimensionThresholds: jest
        .fn()
        .mockReturnValue({ passed: true, failingDimensions: [] }),
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluatePlan', () => {
    it('should evaluate a plan and pass on first attempt with good scores', async () => {
      const plan = createMockPlan();

      // Mock panel evaluator results
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('intentAnalyst', { intentAlignment: 0.9 }),
        createMockEvaluatorResult('coverageChecker', {
          queryCoverage: 0.85,
          scopeAppropriateness: 0.8,
        }),
      ]);

      // Mock score aggregation
      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: {
          intentAlignment: 0.9,
          queryCoverage: 0.85,
          scopeAppropriateness: 0.8,
        },
        confidence: 0.87,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.88);
      mockScoreAggregator.checkEscalationTriggers.mockReturnValue(null);

      const result = await service.evaluatePlan({
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries: plan.searchQueries,
        },
      });

      expect(result.passed).toBe(true);
      expect(result.totalIterations).toBe(1);
      expect(result.escalatedToLargeModel).toBe(false);
      expect(result.scores).toEqual({
        intentAlignment: 0.9,
        queryCoverage: 0.85,
        scopeAppropriateness: 0.8,
      });
      expect(result.confidence).toBe(0.87);
      expect(mockPanelEvaluator.evaluateWithPanel).toHaveBeenCalledTimes(1);
    });

    it('should iterate multiple times when scores are below threshold', async () => {
      const plan = createMockPlan();

      // Mock failing scores that improve over iterations
      mockPanelEvaluator.evaluateWithPanel
        .mockResolvedValueOnce([
          createMockEvaluatorResult('intentAnalyst', { intentAlignment: 0.5 }),
        ])
        .mockResolvedValueOnce([
          createMockEvaluatorResult('intentAnalyst', { intentAlignment: 0.6 }),
        ])
        .mockResolvedValueOnce([
          createMockEvaluatorResult('intentAnalyst', { intentAlignment: 0.75 }),
        ]);

      mockScoreAggregator.aggregateScores
        .mockReturnValueOnce({
          scores: { intentAlignment: 0.5 },
          confidence: 0.9,
        })
        .mockReturnValueOnce({
          scores: { intentAlignment: 0.6 },
          confidence: 0.9,
        })
        .mockReturnValueOnce({
          scores: { intentAlignment: 0.75 },
          confidence: 0.9,
        });

      mockScoreAggregator.calculateOverallScore
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.6)
        .mockReturnValueOnce(0.75);

      mockScoreAggregator.checkEscalationTriggers.mockReturnValue(null);

      const result = await service.evaluatePlan({
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries: plan.searchQueries,
        },
      });

      expect(result.passed).toBe(true);
      expect(result.totalIterations).toBe(3);
      expect(result.attempts).toHaveLength(3);
      expect(mockPanelEvaluator.evaluateWithPanel).toHaveBeenCalledTimes(3);
    });

    it('should escalate to large model when borderline scores are detected', async () => {
      const plan = createMockPlan();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('intentAnalyst', { intentAlignment: 0.68 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { intentAlignment: 0.68 },
        confidence: 0.5,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.68);
      mockScoreAggregator.checkEscalationTriggers.mockReturnValue('borderline');

      mockEscalationHandler.escalate.mockResolvedValue({
        finalVerdict: 'pass',
        scores: { intentAlignment: 0.75 },
        confidence: 0.9,
        panelReview: 'Approved after large model review',
      });

      const result = await service.evaluatePlan({
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries: plan.searchQueries,
        },
      });

      expect(result.escalatedToLargeModel).toBe(true);
      expect(result.passed).toBe(true);
      expect(mockEscalationHandler.escalate).toHaveBeenCalledWith({
        query: '', // currentPlan.query is undefined, so it falls back to ''
        content: expect.any(Object),
        panelResults: expect.any(Array),
        trigger: 'borderline',
      });
    });

    it('should fail after max iterations when scores remain low', async () => {
      const plan = createMockPlan();

      // Mock consistently low scores
      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('intentAnalyst', { intentAlignment: 0.4 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { intentAlignment: 0.4 },
        confidence: 0.9,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.4);
      mockScoreAggregator.checkEscalationTriggers.mockReturnValue(null);

      const result = await service.evaluatePlan({
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries: plan.searchQueries,
        },
      });

      expect(result.passed).toBe(false);
      expect(result.totalIterations).toBe(3); // MAX_ATTEMPTS default is 3
      expect(result.attempts).toHaveLength(3);
      expect(mockPanelEvaluator.evaluateWithPanel).toHaveBeenCalledTimes(3);
    });

    it('should handle escalation failure gracefully', async () => {
      const plan = createMockPlan();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('intentAnalyst', { intentAlignment: 0.68 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { intentAlignment: 0.68 },
        confidence: 0.5,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.68);
      mockScoreAggregator.checkEscalationTriggers.mockReturnValue('borderline');

      mockEscalationHandler.escalate.mockRejectedValue(
        new Error('Escalation service unavailable'),
      );

      // The evaluation should handle escalation failure gracefully and continue with attempts
      const result = await service.evaluatePlan({
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries: plan.searchQueries,
        },
      });

      // Should return a result with failed attempts
      expect(result.passed).toBe(false);
      expect(result.totalIterations).toBe(3); // Should retry max attempts
      expect(result.escalatedToLargeModel).toBe(false);
    });

    it('should extract and use search queries from plan', async () => {
      const plan = createMockPlan();

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        createMockEvaluatorResult('intentAnalyst', { intentAlignment: 0.9 }),
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { intentAlignment: 0.9 },
        confidence: 0.9,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.9);
      mockScoreAggregator.checkEscalationTriggers.mockReturnValue(null);

      await service.evaluatePlan({
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries: plan.searchQueries,
        },
      });

      expect(mockPanelEvaluator.evaluateWithPanel).toHaveBeenCalledWith(
        ['intentAnalyst', 'coverageChecker'],
        expect.objectContaining({
          query: plan.query,
          plan: expect.objectContaining({
            searchQueries: plan.searchQueries,
          }),
        }),
      );
    });

    it('should include critique in result when evaluation fails', async () => {
      const plan = createMockPlan();
      const critique =
        'Plan lacks comprehensive coverage of quantum algorithms';

      mockPanelEvaluator.evaluateWithPanel.mockResolvedValue([
        {
          ...createMockEvaluatorResult('intentAnalyst', {
            intentAlignment: 0.4,
          }),
          critique,
        },
      ]);

      mockScoreAggregator.aggregateScores.mockReturnValue({
        scores: { intentAlignment: 0.4 },
        confidence: 0.9,
      });

      mockScoreAggregator.calculateOverallScore.mockReturnValue(0.4);
      mockScoreAggregator.checkEscalationTriggers.mockReturnValue(null);

      const result = await service.evaluatePlan({
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries: plan.searchQueries,
        },
      });

      expect(result.passed).toBe(false);
      expect(result.attempts).toBeDefined();
      expect(result.attempts.length).toBeGreaterThan(0);
      // Check that evaluator results contain critique
      expect(result.attempts[0].evaluatorResults[0].critique).toBe(critique);
    });
  });
});
