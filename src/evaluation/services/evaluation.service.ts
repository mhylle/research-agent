import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EvaluationRecordEntity } from '../entities/evaluation-record.entity';
import {
  EvaluationResult,
  EvaluationConfig,
  DEFAULT_EVALUATION_CONFIG,
} from '../interfaces';

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
    if (!this.config.enabled) {
      this.logger.debug(`Evaluation disabled, using fallback for ${context}`);
      return fallback;
    }

    const timeout = this.getTimeoutForContext(context);

    try {
      const result = await Promise.race([
        evaluationFn(),
        this.createTimeout<T>(timeout, context),
      ]);
      return result;
    } catch (error) {
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
}
