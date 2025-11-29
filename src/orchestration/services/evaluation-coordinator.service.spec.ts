// src/orchestration/services/evaluation-coordinator.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { EvaluationCoordinatorService } from './evaluation-coordinator.service';
import { EventCoordinatorService } from './event-coordinator.service';
import { ResultExtractorService } from './result-extractor.service';
import { PlanEvaluationOrchestratorService } from '../../evaluation/services/plan-evaluation-orchestrator.service';
import { RetrievalEvaluatorService } from '../../evaluation/services/retrieval-evaluator.service';
import { AnswerEvaluatorService } from '../../evaluation/services/answer-evaluator.service';
import { EvaluationService } from '../../evaluation/services/evaluation.service';
import { Plan } from '../interfaces/plan.interface';

describe('EvaluationCoordinatorService', () => {
  let service: EvaluationCoordinatorService;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;
  let resultExtractor: jest.Mocked<ResultExtractorService>;
  let planEvaluationOrchestrator: jest.Mocked<PlanEvaluationOrchestratorService>;
  let retrievalEvaluator: jest.Mocked<RetrievalEvaluatorService>;
  let answerEvaluator: jest.Mocked<AnswerEvaluatorService>;
  let evaluationService: jest.Mocked<EvaluationService>;

  beforeEach(async () => {
    const mockEventCoordinator = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const mockResultExtractor = {
      collectRetrievalContent: jest.fn().mockReturnValue([]),
    };

    const mockPlanEvaluationOrchestrator = {
      evaluatePlan: jest.fn(),
    };

    const mockRetrievalEvaluator = {
      evaluate: jest.fn(),
    };

    const mockAnswerEvaluator = {
      evaluate: jest.fn(),
    };

    const mockEvaluationService = {
      saveEvaluationRecord: jest.fn().mockResolvedValue(undefined),
      updateEvaluationRecord: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvaluationCoordinatorService,
        { provide: EventCoordinatorService, useValue: mockEventCoordinator },
        { provide: ResultExtractorService, useValue: mockResultExtractor },
        {
          provide: PlanEvaluationOrchestratorService,
          useValue: mockPlanEvaluationOrchestrator,
        },
        {
          provide: RetrievalEvaluatorService,
          useValue: mockRetrievalEvaluator,
        },
        { provide: AnswerEvaluatorService, useValue: mockAnswerEvaluator },
        { provide: EvaluationService, useValue: mockEvaluationService },
      ],
    }).compile();

    service = module.get<EvaluationCoordinatorService>(
      EvaluationCoordinatorService,
    );
    eventCoordinator = module.get(EventCoordinatorService);
    resultExtractor = module.get(ResultExtractorService);
    planEvaluationOrchestrator = module.get(PlanEvaluationOrchestratorService);
    retrievalEvaluator = module.get(RetrievalEvaluatorService);
    answerEvaluator = module.get(AnswerEvaluatorService);
    evaluationService = module.get(EvaluationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluatePlan', () => {
    const logId = 'test-log-id';
    const plan: Plan = {
      id: 'test-plan-id',
      query: 'test query',
      phases: [],
      status: 'pending',
      createdAt: new Date(),
      completedAt: undefined,
    };
    const searchQueries = ['query1', 'query2'];

    it('should emit evaluation_started event', async () => {
      planEvaluationOrchestrator.evaluatePlan.mockResolvedValue({
        passed: true,
        scores: { completeness: 0.9, accuracy: 0.8 },
        confidence: 0.85,
        totalIterations: 1,
        escalatedToLargeModel: false,
        evaluationSkipped: false,
        attempts: [],
        explanations: {},
      });

      await service.evaluatePlan(logId, plan, searchQueries);

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'evaluation_started',
        {
          phase: 'plan',
          query: plan.query,
        },
      );
    });

    it('should delegate to PlanEvaluationOrchestratorService', async () => {
      const mockResult = {
        passed: true,
        scores: { completeness: 0.9, accuracy: 0.8 },
        confidence: 0.85,
        totalIterations: 1,
        escalatedToLargeModel: false,
        evaluationSkipped: false,
        attempts: [],
        explanations: {},
      };
      planEvaluationOrchestrator.evaluatePlan.mockResolvedValue(mockResult);

      const result = await service.evaluatePlan(logId, plan, searchQueries);

      expect(planEvaluationOrchestrator.evaluatePlan).toHaveBeenCalledWith({
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries,
        },
      });
      expect(result).toEqual(mockResult);
    });

    it('should emit evaluation_completed event with all fields', async () => {
      const mockResult = {
        passed: true,
        scores: { completeness: 0.9, accuracy: 0.8 },
        confidence: 0.85,
        totalIterations: 2,
        escalatedToLargeModel: true,
        evaluationSkipped: false,
        attempts: [],
        explanations: {},
      };
      planEvaluationOrchestrator.evaluatePlan.mockResolvedValue(mockResult);

      await service.evaluatePlan(logId, plan, searchQueries);

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'evaluation_completed',
        {
          phase: 'plan',
          passed: mockResult.passed,
          scores: mockResult.scores,
          confidence: mockResult.confidence,
          totalIterations: mockResult.totalIterations,
          escalatedToLargeModel: mockResult.escalatedToLargeModel,
          evaluationSkipped: mockResult.evaluationSkipped,
          skipReason: undefined,
        },
      );
    });

    it('should save evaluation record to database', async () => {
      const mockResult = {
        passed: true,
        scores: { completeness: 0.9, accuracy: 0.8 },
        confidence: 0.85,
        totalIterations: 1,
        escalatedToLargeModel: false,
        evaluationSkipped: false,
        attempts: [{ scores: {}, passed: true }],
        explanations: { completeness: 'test' },
      };
      planEvaluationOrchestrator.evaluatePlan.mockResolvedValue(mockResult);

      await service.evaluatePlan(logId, plan, searchQueries);

      expect(evaluationService.saveEvaluationRecord).toHaveBeenCalledWith({
        logId,
        userQuery: plan.query,
        planEvaluation: {
          attempts: mockResult.attempts,
          finalScores: mockResult.scores,
          explanations: mockResult.explanations,
          passed: mockResult.passed,
          totalIterations: mockResult.totalIterations,
          escalatedToLargeModel: mockResult.escalatedToLargeModel,
        },
        overallScore: mockResult.confidence,
        evaluationSkipped: mockResult.evaluationSkipped,
        skipReason: undefined,
      });
    });

    it('should handle evaluation skipped scenario', async () => {
      const mockResult = {
        passed: true,
        scores: {},
        confidence: 1.0,
        totalIterations: 0,
        escalatedToLargeModel: false,
        evaluationSkipped: true,
        skipReason: 'test skip reason',
        attempts: [],
        explanations: {},
      };
      planEvaluationOrchestrator.evaluatePlan.mockResolvedValue(mockResult);

      await service.evaluatePlan(logId, plan, searchQueries);

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'evaluation_completed',
        expect.objectContaining({
          evaluationSkipped: true,
          skipReason: 'test skip reason',
        }),
      );
    });

    it('should not throw if evaluation record save fails', async () => {
      const mockResult = {
        passed: true,
        scores: { completeness: 0.9 },
        confidence: 0.85,
        totalIterations: 1,
        escalatedToLargeModel: false,
        evaluationSkipped: false,
        attempts: [],
        explanations: {},
      };
      planEvaluationOrchestrator.evaluatePlan.mockResolvedValue(mockResult);
      evaluationService.saveEvaluationRecord.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.evaluatePlan(logId, plan, searchQueries),
      ).resolves.not.toThrow();
      expect(evaluationService.saveEvaluationRecord).toHaveBeenCalled();
    });

    it('should propagate errors from plan evaluation orchestrator', async () => {
      planEvaluationOrchestrator.evaluatePlan.mockRejectedValue(
        new Error('Evaluation failed'),
      );

      await expect(
        service.evaluatePlan(logId, plan, searchQueries),
      ).rejects.toThrow('Evaluation failed');
    });
  });

  describe('evaluateRetrieval', () => {
    const logId = 'test-log-id';
    const query = 'test query';
    const stepResults = [
      {
        status: 'completed' as const,
        stepId: 'step1',
        output: [{ url: 'http://test.com', content: 'test content' }],
        input: {},
        toolName: 'search',
      },
    ];

    it('should emit evaluation_started event', async () => {
      retrievalEvaluator.evaluate.mockResolvedValue({
        passed: true,
        scores: { relevance: 0.9 },
        confidence: 0.85,
        flaggedSevere: false,
        sourceDetails: [],
        evaluationSkipped: false,
        explanations: {},
      });

      await service.evaluateRetrieval(logId, query, stepResults);

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'evaluation_started',
        {
          phase: 'retrieval',
          query,
        },
      );
    });

    it('should delegate to RetrievalEvaluatorService', async () => {
      const mockResult = {
        passed: true,
        scores: { relevance: 0.9, coverage: 0.8 },
        confidence: 0.85,
        flaggedSevere: false,
        sourceDetails: [{ url: 'http://test.com', relevanceScore: 0.9 }],
        evaluationSkipped: false,
        explanations: {},
      };
      retrievalEvaluator.evaluate.mockResolvedValue(mockResult);

      const result = await service.evaluateRetrieval(logId, query, stepResults);

      expect(retrievalEvaluator.evaluate).toHaveBeenCalledWith({
        query,
        retrievedContent: expect.any(Array),
      });
      expect(result).toEqual(mockResult);
    });

    it('should emit evaluation_completed event with all fields', async () => {
      const mockResult = {
        passed: true,
        scores: { relevance: 0.9 },
        confidence: 0.85,
        flaggedSevere: true,
        sourceDetails: [{ url: 'http://test.com', relevanceScore: 0.9 }],
        evaluationSkipped: false,
        explanations: {},
      };
      retrievalEvaluator.evaluate.mockResolvedValue(mockResult);

      await service.evaluateRetrieval(logId, query, stepResults);

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'evaluation_completed',
        {
          phase: 'retrieval',
          passed: mockResult.passed,
          scores: mockResult.scores,
          confidence: mockResult.confidence,
          flaggedSevere: mockResult.flaggedSevere,
          sourceDetails: mockResult.sourceDetails,
          evaluationSkipped: mockResult.evaluationSkipped,
          skipReason: undefined,
        },
      );
    });

    it('should update evaluation record in database', async () => {
      const mockResult = {
        passed: true,
        scores: { relevance: 0.9 },
        confidence: 0.85,
        flaggedSevere: false,
        sourceDetails: [{ url: 'http://test.com', relevanceScore: 0.9 }],
        evaluationSkipped: false,
        explanations: { relevance: 'test' },
      };
      retrievalEvaluator.evaluate.mockResolvedValue(mockResult);

      await service.evaluateRetrieval(logId, query, stepResults);

      expect(evaluationService.updateEvaluationRecord).toHaveBeenCalledWith(
        logId,
        {
          retrievalEvaluation: {
            scores: mockResult.scores,
            explanations: mockResult.explanations,
            passed: mockResult.passed,
            flaggedSevere: mockResult.flaggedSevere,
            sourceDetails: mockResult.sourceDetails,
          },
        },
      );
    });

    it('should not throw if evaluation record update fails', async () => {
      const mockResult = {
        passed: true,
        scores: { relevance: 0.9 },
        confidence: 0.85,
        flaggedSevere: false,
        sourceDetails: [],
        evaluationSkipped: false,
        explanations: {},
      };
      retrievalEvaluator.evaluate.mockResolvedValue(mockResult);
      evaluationService.updateEvaluationRecord.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.evaluateRetrieval(logId, query, stepResults),
      ).resolves.not.toThrow();
      expect(evaluationService.updateEvaluationRecord).toHaveBeenCalled();
    });

    it('should propagate errors from retrieval evaluator', async () => {
      retrievalEvaluator.evaluate.mockRejectedValue(
        new Error('Evaluation failed'),
      );

      await expect(
        service.evaluateRetrieval(logId, query, stepResults),
      ).rejects.toThrow('Evaluation failed');
    });
  });

  describe('evaluateAnswer', () => {
    const logId = 'test-log-id';
    const query = 'test query';
    const answer = 'test answer';
    const sources = [
      { url: 'http://test.com', title: 'Test', relevance: 'high' },
    ];

    it('should delegate to AnswerEvaluatorService', async () => {
      const mockResult = {
        passed: true,
        scores: { accuracy: 0.9, completeness: 0.8 },
        confidence: 0.85,
        shouldRegenerate: false,
        evaluationSkipped: false,
        explanations: {},
        critique: 'Good answer',
        improvementSuggestions: [],
      };
      answerEvaluator.evaluate.mockResolvedValue(mockResult);

      const result = await service.evaluateAnswer(
        logId,
        query,
        answer,
        sources,
      );

      expect(answerEvaluator.evaluate).toHaveBeenCalledWith({
        query,
        answer,
        sources: sources.map((s) => ({
          url: s.url,
          content: '',
          title: s.title,
        })),
      });
      expect(result).toEqual(mockResult);
    });

    it('should emit evaluation_completed event with all fields', async () => {
      const mockResult = {
        passed: true,
        scores: { accuracy: 0.9, completeness: 0.8 },
        confidence: 0.85,
        shouldRegenerate: false,
        evaluationSkipped: false,
        explanations: {},
        critique: 'Good answer',
        improvementSuggestions: [],
      };
      answerEvaluator.evaluate.mockResolvedValue(mockResult);

      await service.evaluateAnswer(logId, query, answer, sources);

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'evaluation_completed',
        {
          phase: 'answer',
          passed: mockResult.passed,
          scores: mockResult.scores,
          confidence: mockResult.confidence,
          shouldRegenerate: mockResult.shouldRegenerate,
          evaluationSkipped: mockResult.evaluationSkipped,
          skipReason: undefined,
        },
      );
    });

    it('should update evaluation record in database', async () => {
      const mockResult = {
        passed: true,
        scores: { accuracy: 0.9, completeness: 0.8 },
        confidence: 0.85,
        shouldRegenerate: false,
        evaluationSkipped: false,
        explanations: { accuracy: 'test' },
        critique: 'Good answer',
        improvementSuggestions: ['suggestion 1'],
      };
      answerEvaluator.evaluate.mockResolvedValue(mockResult);

      await service.evaluateAnswer(logId, query, answer, sources);

      expect(evaluationService.updateEvaluationRecord).toHaveBeenCalledWith(
        logId,
        {
          answerEvaluation: {
            attempts: [
              {
                scores: mockResult.scores,
                passed: mockResult.passed,
                confidence: mockResult.confidence,
                critique: mockResult.critique,
                suggestions: mockResult.improvementSuggestions,
              },
            ],
            finalScores: mockResult.scores,
            explanations: mockResult.explanations,
            passed: mockResult.passed,
            regenerated: false,
          },
        },
      );
    });

    it('should not throw if evaluation record update fails', async () => {
      const mockResult = {
        passed: true,
        scores: { accuracy: 0.9 },
        confidence: 0.85,
        shouldRegenerate: false,
        evaluationSkipped: false,
        explanations: {},
        critique: '',
        improvementSuggestions: [],
      };
      answerEvaluator.evaluate.mockResolvedValue(mockResult);
      evaluationService.updateEvaluationRecord.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.evaluateAnswer(logId, query, answer, sources),
      ).resolves.not.toThrow();
      expect(evaluationService.updateEvaluationRecord).toHaveBeenCalled();
    });

    it('should propagate errors from answer evaluator', async () => {
      answerEvaluator.evaluate.mockRejectedValue(
        new Error('Evaluation failed'),
      );

      await expect(
        service.evaluateAnswer(logId, query, answer, sources),
      ).rejects.toThrow('Evaluation failed');
    });
  });
});
