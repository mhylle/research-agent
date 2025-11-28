import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EvaluationController } from '../evaluation.controller';
import { EvaluationService } from '../services/evaluation.service';
import { createMockEvaluationRecord } from './test-fixtures';

describe('EvaluationController', () => {
  let controller: EvaluationController;
  let mockEvaluationService: any;

  beforeEach(async () => {
    mockEvaluationService = {
      getRecords: jest.fn(),
      getRecordById: jest.fn(),
      getStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EvaluationController],
      providers: [
        { provide: EvaluationService, useValue: mockEvaluationService },
      ],
    }).compile();

    controller = module.get<EvaluationController>(EvaluationController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('health', () => {
    it('should return health status', () => {
      const result = controller.health();
      expect(result).toEqual({ status: 'ok', module: 'evaluation' });
    });
  });

  describe('getRecords', () => {
    it('should return paginated records with default parameters', async () => {
      const mockRecords = {
        records: [
          {
            id: '1',
            query: 'What is quantum computing?',
            logId: 'log-123',
            sessionId: 'session-123',
            timestamp: '2024-01-01T00:00:00.000Z',
            overallStatus: 'passed',
            passed: true,
            evaluations: [],
            metadata: { totalAttempts: 1 },
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockEvaluationService.getRecords.mockResolvedValue(mockRecords);

      const result = await controller.getRecords();

      expect(result).toEqual(mockRecords);
      expect(mockEvaluationService.getRecords).toHaveBeenCalledWith(1, 10, undefined);
    });

    it('should return paginated records with custom parameters', async () => {
      const mockRecords = {
        records: [],
        total: 50,
        page: 2,
        limit: 20,
        totalPages: 3,
      };

      mockEvaluationService.getRecords.mockResolvedValue(mockRecords);

      const result = await controller.getRecords('2', '20');

      expect(result).toEqual(mockRecords);
      expect(mockEvaluationService.getRecords).toHaveBeenCalledWith(2, 20, undefined);
    });

    it('should filter records by passed status', async () => {
      const mockRecords = {
        records: [
          {
            id: '1',
            query: 'Test query',
            passed: true,
            logId: 'log-123',
            sessionId: 'session-123',
            timestamp: '2024-01-01T00:00:00.000Z',
            overallStatus: 'passed',
            evaluations: [],
            metadata: { totalAttempts: 1 },
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockEvaluationService.getRecords.mockResolvedValue(mockRecords);

      const result = await controller.getRecords('1', '10', 'true');

      expect(result).toEqual(mockRecords);
      expect(mockEvaluationService.getRecords).toHaveBeenCalledWith(1, 10, true);
    });

    it('should filter records by failed status', async () => {
      const mockRecords = {
        records: [
          {
            id: '2',
            query: 'Failed query',
            passed: false,
            logId: 'log-456',
            sessionId: 'session-456',
            timestamp: '2024-01-02T00:00:00.000Z',
            overallStatus: 'failed',
            evaluations: [],
            metadata: { totalAttempts: 3 },
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockEvaluationService.getRecords.mockResolvedValue(mockRecords);

      const result = await controller.getRecords('1', '10', 'false');

      expect(result).toEqual(mockRecords);
      expect(mockEvaluationService.getRecords).toHaveBeenCalledWith(1, 10, false);
    });

    it('should handle invalid page and limit values', async () => {
      const mockRecords = {
        records: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      mockEvaluationService.getRecords.mockResolvedValue(mockRecords);

      await controller.getRecords('invalid', 'invalid');

      // Should default to NaN which will be handled by the service
      expect(mockEvaluationService.getRecords).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return evaluation statistics', async () => {
      const mockStats = {
        totalRecords: 100,
        passedCount: 85,
        failedCount: 15,
        passRate: 85,
        averageScores: {
          intentAlignment: 0.8,
          queryCoverage: 0.75,
          scopeAppropriateness: 0.82,
          relevance: 0.78,
          completeness: 0.8,
          accuracy: 0.85,
        },
        phaseBreakdown: [
          { phase: 'plan', total: 100, passed: 85, failed: 15, passRate: 85 },
          { phase: 'retrieval', total: 85, passed: 80, failed: 5, passRate: 94 },
          { phase: 'answer', total: 80, passed: 75, failed: 5, passRate: 93.75 },
        ],
        scoreDistribution: [
          { range: '0-20', count: 2 },
          { range: '21-40', count: 5 },
          { range: '41-60', count: 8 },
          { range: '61-80', count: 35 },
          { range: '81-100', count: 50 },
        ],
      };

      mockEvaluationService.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(result).toEqual(mockStats);
      expect(mockEvaluationService.getStats).toHaveBeenCalledTimes(1);
    });

    it('should return empty statistics when no records exist', async () => {
      const emptyStats = {
        totalRecords: 0,
        passedCount: 0,
        failedCount: 0,
        passRate: 0,
        averageScores: {
          intentAlignment: 0,
          queryCoverage: 0,
          scopeAppropriateness: 0,
          relevance: 0,
          completeness: 0,
          accuracy: 0,
        },
        phaseBreakdown: [
          { phase: 'plan', total: 0, passed: 0, failed: 0, passRate: 0 },
          { phase: 'retrieval', total: 0, passed: 0, failed: 0, passRate: 0 },
          { phase: 'answer', total: 0, passed: 0, failed: 0, passRate: 0 },
        ],
        scoreDistribution: [
          { range: '0-20', count: 0 },
          { range: '21-40', count: 0 },
          { range: '41-60', count: 0 },
          { range: '61-80', count: 0 },
          { range: '81-100', count: 0 },
        ],
      };

      mockEvaluationService.getStats.mockResolvedValue(emptyStats);

      const result = await controller.getStats();

      expect(result).toEqual(emptyStats);
      expect(result.totalRecords).toBe(0);
      expect(result.passRate).toBe(0);
    });
  });

  describe('getRecordById', () => {
    it('should return a specific evaluation record', async () => {
      const mockRecord = createMockEvaluationRecord({ id: 'test-id-123' });

      mockEvaluationService.getRecordById.mockResolvedValue(mockRecord);

      const result = await controller.getRecordById('test-id-123');

      expect(result).toEqual(mockRecord);
      expect(mockEvaluationService.getRecordById).toHaveBeenCalledWith('test-id-123');
    });

    it('should throw NotFoundException when record does not exist', async () => {
      mockEvaluationService.getRecordById.mockResolvedValue(null);

      await expect(controller.getRecordById('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.getRecordById('non-existent-id')).rejects.toThrow(
        'Evaluation record non-existent-id not found',
      );
    });

    it('should handle service errors gracefully', async () => {
      mockEvaluationService.getRecordById.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(controller.getRecordById('test-id')).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should return record with all evaluation phases', async () => {
      const mockRecord = createMockEvaluationRecord({
        id: 'full-eval-id',
        planEvaluation: {
          attempts: [],
          finalScores: { intentAlignment: 0.9 },
          passed: true,
          totalIterations: 1,
          escalatedToLargeModel: false,
        },
        retrievalEvaluation: {
          scores: { contextRecall: 0.85, contextPrecision: 0.8, sourceQuality: 0.9 },
          passed: true,
          flaggedSevere: false,
          sourceDetails: [],
        },
        answerEvaluation: {
          attempts: [],
          finalScores: { faithfulness: 0.9, answerRelevance: 0.85, completeness: 0.8 },
          passed: true,
          regenerated: false,
        },
      });

      mockEvaluationService.getRecordById.mockResolvedValue(mockRecord);

      const result = await controller.getRecordById('full-eval-id');

      expect(result.planEvaluation).toBeDefined();
      expect(result.retrievalEvaluation).toBeDefined();
      expect(result.answerEvaluation).toBeDefined();
    });

    it('should return record with partial evaluation data', async () => {
      const mockRecord = createMockEvaluationRecord({
        id: 'partial-eval-id',
        planEvaluation: {
          attempts: [],
          finalScores: { intentAlignment: 0.4 },
          passed: false,
          totalIterations: 3,
          escalatedToLargeModel: false,
        },
        retrievalEvaluation: null,
        answerEvaluation: null,
      });

      mockEvaluationService.getRecordById.mockResolvedValue(mockRecord);

      const result = await controller.getRecordById('partial-eval-id');

      expect(result.planEvaluation).toBeDefined();
      expect(result.retrievalEvaluation).toBeNull();
      expect(result.answerEvaluation).toBeNull();
    });
  });
});
