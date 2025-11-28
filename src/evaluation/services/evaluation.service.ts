import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EvaluationRecordEntity } from '../entities/evaluation-record.entity';
import {
  EvaluationResult,
  EvaluationConfig,
  DEFAULT_EVALUATION_CONFIG,
} from '../interfaces';

// Frontend-compatible paginated response
export interface PaginatedRecords {
  records: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Frontend-compatible stats response
export interface EvaluationStats {
  totalRecords: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  averageScores: {
    intentAlignment: number;
    queryCoverage: number;
    scopeAppropriateness: number;
    relevance: number;
    completeness: number;
    accuracy: number;
  };
  phaseBreakdown: Array<{
    phase: string;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
  scoreDistribution: Array<{
    range: string;
    count: number;
  }>;
}

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  private config: EvaluationConfig = DEFAULT_EVALUATION_CONFIG;

  constructor(
    @InjectRepository(EvaluationRecordEntity)
    private evaluationRepository: Repository<EvaluationRecordEntity>,
  ) {}

  async evaluateWithFallback<T extends EvaluationResult>(
    evaluationFn: () => Promise<T>,
    fallback: T,
    context: string,
  ): Promise<T> {
    console.log(`[EvaluationService] evaluateWithFallback called for ${context}`);
    console.log(`[EvaluationService] Evaluation enabled: ${this.config.enabled}`);

    if (!this.config.enabled) {
      this.logger.debug(`Evaluation disabled, using fallback for ${context}`);
      console.log(`[EvaluationService] Returning fallback - evaluation disabled`);
      return fallback;
    }

    const timeout = this.getTimeoutForContext(context);
    console.log(`[EvaluationService] Starting evaluation with timeout: ${timeout}ms`);

    try {
      console.log(`[EvaluationService] Calling evaluation function...`);
      const result = await Promise.race([
        evaluationFn(),
        this.createTimeout<T>(timeout, context),
      ]);
      console.log(`[EvaluationService] Evaluation completed successfully`);
      return result;
    } catch (error) {
      console.error(`[EvaluationService] Evaluation failed:`, error);
      this.logger.warn(
        `Evaluation failed (${context}), continuing with fallback`,
        {
          error: error.message,
          context,
        },
      );

      await this.persistEvaluationError(context, error);

      return {
        ...fallback,
        evaluationSkipped: true,
        skipReason: error.message,
      } as T;
    }
  }

  private getTimeoutForContext(context: string): number {
    if (context.includes('plan')) {
      return this.config.planEvaluation?.timeout || 60000;
    }
    if (context.includes('retrieval')) {
      return this.config.retrievalEvaluation?.timeout || 30000;
    }
    if (context.includes('answer')) {
      return this.config.answerEvaluation?.timeout || 45000;
    }
    return 60000;
  }

  private createTimeout<T>(ms: number, context: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Evaluation timeout (${ms}ms) for ${context}`)),
        ms,
      );
    });
  }

  private async persistEvaluationError(
    context: string,
    error: Error,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Persisting evaluation error for ${context}: ${error.message}`,
      );
      // Will be implemented with full persistence later
    } catch (persistError) {
      this.logger.error(
        `Failed to persist evaluation error: ${persistError.message}`,
      );
    }
  }

  // Placeholder methods for plan evaluation (to be implemented in Phase 2)
  async evaluatePlan(plan: any, query: string): Promise<EvaluationResult> {
    return this.evaluateWithFallback(
      async () => {
        this.logger.log('Plan evaluation not yet implemented');
        return {
          passed: true,
          scores: {},
          confidence: 1,
          evaluationSkipped: true,
        };
      },
      {
        passed: true,
        scores: {},
        confidence: 1,
        evaluationSkipped: true,
      },
      'plan-evaluation',
    );
  }

  async getRecords(
    page: number = 1,
    limit: number = 10,
    passed?: boolean,
  ): Promise<PaginatedRecords> {
    const queryBuilder = this.evaluationRepository
      .createQueryBuilder('record')
      .orderBy('record.timestamp', 'DESC');

    if (passed !== undefined) {
      // For SQLite with simple-json, we need to check the JSON text
      queryBuilder.andWhere(
        `json_extract(record.planEvaluation, '$.passed') = :passed`,
        { passed: passed ? 1 : 0 },
      );
    }

    const total = await queryBuilder.getCount();
    const totalPages = Math.ceil(total / limit);

    const entities = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Transform to frontend-compatible format
    const records = entities.map((entity) => this.transformToFrontendRecord(entity));

    return {
      records,
      total,
      page,
      limit,
      totalPages,
    };
  }

  private transformToFrontendRecord(entity: EvaluationRecordEntity): any {
    // Build evaluations array from the plan/retrieval/answer evaluations
    const evaluations: any[] = [];

    if (entity.planEvaluation) {
      evaluations.push({
        phase: 'plan',
        passed: entity.planEvaluation.passed,
        scores: entity.planEvaluation.finalScores || {},
        confidence: 1,
      });
    }

    if (entity.retrievalEvaluation) {
      evaluations.push({
        phase: 'retrieval',
        passed: entity.retrievalEvaluation.passed,
        scores: entity.retrievalEvaluation.scores || {},
        confidence: 1,
      });
    }

    if (entity.answerEvaluation) {
      evaluations.push({
        phase: 'answer',
        passed: entity.answerEvaluation.passed,
        scores: entity.answerEvaluation.finalScores || {},
        confidence: 1,
      });
    }

    return {
      id: entity.id,
      query: entity.userQuery,
      logId: entity.logId,
      sessionId: entity.queryId || entity.logId,
      timestamp: entity.timestamp.toISOString(),
      overallStatus: entity.planEvaluation?.passed ? 'passed' : 'failed',
      passed: entity.planEvaluation?.passed ?? false,
      evaluations,
      metadata: {
        totalAttempts: entity.planEvaluation?.totalIterations || 1,
      },
    };
  }

  async getRecordById(id: string): Promise<EvaluationRecordEntity | null> {
    return this.evaluationRepository.findOne({ where: { id } });
  }

  async getStats(): Promise<EvaluationStats> {
    const records = await this.evaluationRepository.find();
    const total = records.length;

    // Default empty stats
    const emptyStats: EvaluationStats = {
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

    if (total === 0) {
      return emptyStats;
    }

    const passedCount = records.filter((r) => r.planEvaluation?.passed).length;
    const failedCount = total - passedCount;
    const passRate = (passedCount / total) * 100;

    // Calculate average scores
    const scoreAccumulators = {
      intentAlignment: { sum: 0, count: 0 },
      queryCoverage: { sum: 0, count: 0 },
      scopeAppropriateness: { sum: 0, count: 0 },
      relevance: { sum: 0, count: 0 },
      completeness: { sum: 0, count: 0 },
      accuracy: { sum: 0, count: 0 },
    };

    // Phase breakdown accumulators
    const phaseAccumulators = {
      plan: { total: 0, passed: 0 },
      retrieval: { total: 0, passed: 0 },
      answer: { total: 0, passed: 0 },
    };

    // Score distribution
    const scoreDistribution = [0, 0, 0, 0, 0]; // 0-20, 21-40, 41-60, 61-80, 81-100

    for (const record of records) {
      // Process plan evaluation
      if (record.planEvaluation) {
        phaseAccumulators.plan.total++;
        if (record.planEvaluation.passed) {
          phaseAccumulators.plan.passed++;
        }

        const scores = record.planEvaluation.finalScores || {};
        for (const [key, value] of Object.entries(scores)) {
          if (typeof value === 'number' && key in scoreAccumulators) {
            scoreAccumulators[key as keyof typeof scoreAccumulators].sum += value;
            scoreAccumulators[key as keyof typeof scoreAccumulators].count++;
          }
        }
      }

      // Process retrieval evaluation
      if (record.retrievalEvaluation) {
        phaseAccumulators.retrieval.total++;
        if (record.retrievalEvaluation.passed) {
          phaseAccumulators.retrieval.passed++;
        }
      }

      // Process answer evaluation
      if (record.answerEvaluation) {
        phaseAccumulators.answer.total++;
        if (record.answerEvaluation.passed) {
          phaseAccumulators.answer.passed++;
        }
      }

      // Calculate overall score for distribution
      const overallScore = record.overallScore * 100;
      if (overallScore <= 20) scoreDistribution[0]++;
      else if (overallScore <= 40) scoreDistribution[1]++;
      else if (overallScore <= 60) scoreDistribution[2]++;
      else if (overallScore <= 80) scoreDistribution[3]++;
      else scoreDistribution[4]++;
    }

    // Build final response
    return {
      totalRecords: total,
      passedCount,
      failedCount,
      passRate,
      averageScores: {
        intentAlignment: scoreAccumulators.intentAlignment.count > 0
          ? scoreAccumulators.intentAlignment.sum / scoreAccumulators.intentAlignment.count
          : 0,
        queryCoverage: scoreAccumulators.queryCoverage.count > 0
          ? scoreAccumulators.queryCoverage.sum / scoreAccumulators.queryCoverage.count
          : 0,
        scopeAppropriateness: scoreAccumulators.scopeAppropriateness.count > 0
          ? scoreAccumulators.scopeAppropriateness.sum / scoreAccumulators.scopeAppropriateness.count
          : 0,
        relevance: scoreAccumulators.relevance.count > 0
          ? scoreAccumulators.relevance.sum / scoreAccumulators.relevance.count
          : 0,
        completeness: scoreAccumulators.completeness.count > 0
          ? scoreAccumulators.completeness.sum / scoreAccumulators.completeness.count
          : 0,
        accuracy: scoreAccumulators.accuracy.count > 0
          ? scoreAccumulators.accuracy.sum / scoreAccumulators.accuracy.count
          : 0,
      },
      phaseBreakdown: [
        {
          phase: 'plan',
          total: phaseAccumulators.plan.total,
          passed: phaseAccumulators.plan.passed,
          failed: phaseAccumulators.plan.total - phaseAccumulators.plan.passed,
          passRate: phaseAccumulators.plan.total > 0
            ? (phaseAccumulators.plan.passed / phaseAccumulators.plan.total) * 100
            : 0,
        },
        {
          phase: 'retrieval',
          total: phaseAccumulators.retrieval.total,
          passed: phaseAccumulators.retrieval.passed,
          failed: phaseAccumulators.retrieval.total - phaseAccumulators.retrieval.passed,
          passRate: phaseAccumulators.retrieval.total > 0
            ? (phaseAccumulators.retrieval.passed / phaseAccumulators.retrieval.total) * 100
            : 0,
        },
        {
          phase: 'answer',
          total: phaseAccumulators.answer.total,
          passed: phaseAccumulators.answer.passed,
          failed: phaseAccumulators.answer.total - phaseAccumulators.answer.passed,
          passRate: phaseAccumulators.answer.total > 0
            ? (phaseAccumulators.answer.passed / phaseAccumulators.answer.total) * 100
            : 0,
        },
      ],
      scoreDistribution: [
        { range: '0-20', count: scoreDistribution[0] },
        { range: '21-40', count: scoreDistribution[1] },
        { range: '41-60', count: scoreDistribution[2] },
        { range: '61-80', count: scoreDistribution[3] },
        { range: '81-100', count: scoreDistribution[4] },
      ],
    };
  }

  async saveEvaluationRecord(
    record: Partial<EvaluationRecordEntity>,
  ): Promise<EvaluationRecordEntity> {
    const entity = this.evaluationRepository.create(record);
    return this.evaluationRepository.save(entity);
  }
}
