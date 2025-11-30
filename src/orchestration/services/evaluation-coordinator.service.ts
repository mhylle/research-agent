// src/orchestration/services/evaluation-coordinator.service.ts
import { Injectable } from '@nestjs/common';
import { EventCoordinatorService } from './event-coordinator.service';
import { ResultExtractorService } from './result-extractor.service';
import { PlanEvaluationOrchestratorService } from '../../evaluation/services/plan-evaluation-orchestrator.service';
import { RetrievalEvaluatorService } from '../../evaluation/services/retrieval-evaluator.service';
import { AnswerEvaluatorService } from '../../evaluation/services/answer-evaluator.service';
import { EvaluationService } from '../../evaluation/services/evaluation.service';
import { Plan } from '../interfaces/plan.interface';
import { StepResult } from '../interfaces/phase.interface';
import { PlanEvaluationResult as IPlanEvaluationResult } from '../../evaluation/interfaces/evaluation-result.interface';
import { RetrievalEvaluationResult as IRetrievalEvaluationResult } from '../../evaluation/services/retrieval-evaluator.service';
import { AnswerEvaluationResult as IAnswerEvaluationResult } from '../../evaluation/services/answer-evaluator.service';

export type PlanEvaluationResult = IPlanEvaluationResult;
export type RetrievalEvaluationResult = IRetrievalEvaluationResult;
export type AnswerEvaluationResult = IAnswerEvaluationResult;

/**
 * Coordinates all evaluation phases (plan, retrieval, answer).
 * Delegates to specialized evaluator services and handles evaluation record persistence.
 */
@Injectable()
export class EvaluationCoordinatorService {
  constructor(
    private eventCoordinator: EventCoordinatorService,
    private resultExtractor: ResultExtractorService,
    private planEvaluationOrchestrator: PlanEvaluationOrchestratorService,
    private retrievalEvaluator: RetrievalEvaluatorService,
    private answerEvaluator: AnswerEvaluatorService,
    private evaluationService: EvaluationService,
  ) {}

  /**
   * Evaluates the research plan quality.
   * Emits evaluation events and saves the evaluation record to the database.
   *
   * @param logId - Session log ID for event correlation
   * @param plan - The research plan to evaluate
   * @param searchQueries - Extracted search queries from the plan
   * @returns Evaluation result with scores, confidence, and metadata
   */
  async evaluatePlan(
    logId: string,
    plan: Plan,
    searchQueries: string[],
  ): Promise<PlanEvaluationResult> {
    console.log('[EvaluationCoordinator] Starting plan evaluation...');

    // Emit evaluation started event
    await this.eventCoordinator.emit(logId, 'evaluation_started', {
      phase: 'plan',
      query: plan.query,
    });
    console.log('[EvaluationCoordinator] evaluation_started event emitted');

    // Delegate to plan evaluation orchestrator
    console.log(
      '[EvaluationCoordinator] Calling planEvaluationOrchestrator.evaluatePlan...',
    );
    const evaluationResult = await this.planEvaluationOrchestrator.evaluatePlan(
      {
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries,
        },
      },
    );
    console.log(
      '[EvaluationCoordinator] Plan evaluation completed:',
      JSON.stringify(evaluationResult, null, 2),
    );

    // Emit evaluation completed event
    await this.eventCoordinator.emit(logId, 'evaluation_completed', {
      phase: 'plan',
      passed: evaluationResult.passed,
      scores: evaluationResult.scores,
      confidence: evaluationResult.confidence,
      totalIterations: evaluationResult.totalIterations,
      escalatedToLargeModel: evaluationResult.escalatedToLargeModel,
      evaluationSkipped: evaluationResult.evaluationSkipped,
      skipReason: evaluationResult.skipReason,
    });

    // Save evaluation record to database
    console.log(
      '[EvaluationCoordinator] Saving evaluation record to database...',
    );
    try {
      await this.evaluationService.saveEvaluationRecord({
        logId,
        userQuery: plan.query,
        planEvaluation: {
          attempts: evaluationResult.attempts || [],
          finalScores: evaluationResult.scores,
          explanations: evaluationResult.explanations || {},
          passed: evaluationResult.passed,
          totalIterations: evaluationResult.totalIterations,
          escalatedToLargeModel: evaluationResult.escalatedToLargeModel,
        },
        overallScore: evaluationResult.confidence,
        evaluationSkipped: evaluationResult.evaluationSkipped,
        skipReason: evaluationResult.skipReason,
      });
      console.log(
        '[EvaluationCoordinator] Evaluation record saved successfully',
      );
    } catch (error) {
      console.error(
        '[EvaluationCoordinator] Failed to save evaluation record:',
        error,
      );
      // Don't throw - evaluation storage failure shouldn't break research execution
    }

    // Log evaluation result for user visibility
    if (!evaluationResult.evaluationSkipped) {
      const scoresSummary = Object.entries(evaluationResult.scores)
        .map(([dim, score]) => `${dim}: ${(score * 100).toFixed(0)}%`)
        .join(', ');

      console.log(
        `[EvaluationCoordinator] Plan evaluation: ${evaluationResult.passed ? 'PASSED' : 'FAILED'} (${scoresSummary})`,
      );
    }

    return evaluationResult;
  }

  /**
   * Evaluates the quality of retrieved content.
   * Emits evaluation events and updates the evaluation record in the database.
   *
   * @param logId - Session log ID for event correlation
   * @param query - The research query
   * @param stepResults - Step results containing retrieved content
   * @returns Evaluation result with scores, confidence, and source details
   */
  async evaluateRetrieval(
    logId: string,
    query: string,
    stepResults: StepResult[],
  ): Promise<RetrievalEvaluationResult> {
    console.log('[EvaluationCoordinator] Starting retrieval evaluation...');

    // Emit evaluation started event
    await this.eventCoordinator.emit(logId, 'evaluation_started', {
      phase: 'retrieval',
      query: query,
    });

    // Collect retrieval content from step results
    const retrievalContent =
      this.resultExtractor.collectRetrievalContent(stepResults);

    // Delegate to retrieval evaluator
    const retrievalEvalResult = await this.retrievalEvaluator.evaluate({
      query: query,
      retrievedContent: retrievalContent,
    });

    console.log(
      '[EvaluationCoordinator] Retrieval evaluation completed:',
      JSON.stringify(retrievalEvalResult, null, 2),
    );

    // Emit evaluation completed event
    await this.eventCoordinator.emit(logId, 'evaluation_completed', {
      phase: 'retrieval',
      passed: retrievalEvalResult.passed,
      scores: retrievalEvalResult.scores,
      confidence: retrievalEvalResult.confidence,
      flaggedSevere: retrievalEvalResult.flaggedSevere,
      sourceDetails: retrievalEvalResult.sourceDetails,
      evaluationSkipped: retrievalEvalResult.evaluationSkipped,
      skipReason: retrievalEvalResult.skipReason,
    });

    // Update evaluation record with retrieval evaluation
    try {
      await this.evaluationService.updateEvaluationRecord(logId, {
        retrievalEvaluation: {
          scores: retrievalEvalResult.scores,
          explanations: retrievalEvalResult.explanations || {},
          passed: retrievalEvalResult.passed,
          flaggedSevere: retrievalEvalResult.flaggedSevere,
          sourceDetails: retrievalEvalResult.sourceDetails,
        },
      });
    } catch (error) {
      console.error(
        '[EvaluationCoordinator] Failed to update evaluation record:',
        error,
      );
      // Don't throw - evaluation storage failure shouldn't break research execution
    }

    return retrievalEvalResult;
  }

  /**
   * Evaluates the quality of the final answer.
   * Emits evaluation events and updates the evaluation record in the database.
   *
   * @param logId - Session log ID for event correlation
   * @param query - The research query
   * @param answer - The generated answer
   * @param sources - Sources used in the answer
   * @returns Evaluation result with scores, confidence, and improvement suggestions
   */
  async evaluateAnswer(
    logId: string,
    query: string,
    answer: string,
    sources: Array<{ url: string; title: string; relevance: string }>,
  ): Promise<AnswerEvaluationResult> {
    console.log('[EvaluationCoordinator] Starting answer evaluation phase');

    // Delegate to answer evaluator
    const answerEvalResult = await this.answerEvaluator.evaluate({
      query: query,
      answer: answer,
      sources: sources.map((s) => ({
        url: s.url,
        content: '', // Content not stored in sources array
        title: s.title,
      })),
    });

    console.log(
      '[EvaluationCoordinator] Answer evaluation completed:',
      JSON.stringify(answerEvalResult, null, 2),
    );

    // Emit evaluation completed event
    await this.eventCoordinator.emit(logId, 'evaluation_completed', {
      phase: 'answer',
      passed: answerEvalResult.passed,
      scores: answerEvalResult.scores,
      confidence: answerEvalResult.confidence,
      shouldRegenerate: answerEvalResult.shouldRegenerate,
      evaluationSkipped: answerEvalResult.evaluationSkipped,
      skipReason: answerEvalResult.skipReason,
    });

    // Update evaluation record with answer evaluation
    try {
      await this.evaluationService.updateEvaluationRecord(logId, {
        answerEvaluation: {
          attempts: [
            {
              scores: answerEvalResult.scores,
              passed: answerEvalResult.passed,
              confidence: answerEvalResult.confidence,
              critique: answerEvalResult.critique,
              suggestions: answerEvalResult.improvementSuggestions,
            },
          ],
          finalScores: answerEvalResult.scores,
          explanations: answerEvalResult.explanations || {},
          passed: answerEvalResult.passed,
          regenerated: false, // Future: implement answer regeneration
        },
      });
    } catch (error) {
      console.error(
        '[EvaluationCoordinator] Failed to update evaluation record:',
        error,
      );
      // Don't throw - evaluation storage failure shouldn't break research execution
    }

    return answerEvalResult;
  }
}
