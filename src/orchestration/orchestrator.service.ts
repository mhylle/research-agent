// src/orchestration/orchestrator.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PlannerService } from './planner.service';
import { LogService } from '../logging/log.service';
import { EventCoordinatorService } from './services/event-coordinator.service';
import { ResultExtractorService } from './services/result-extractor.service';
import { EvaluationCoordinatorService } from './services/evaluation-coordinator.service';
import { PhaseExecutorRegistry } from './phase-executors/phase-executor-registry';
import { Plan } from './interfaces/plan.interface';
import { Phase, PhaseResult, StepResult } from './interfaces/phase.interface';
import { LogEventType } from '../logging/interfaces/log-event-type.enum';
import {
  FailureContext,
  RecoveryDecision,
} from './interfaces/recovery.interface';

export interface ResearchResult {
  logId: string;
  planId: string;
  answer: string;
  sources: Array<{ url: string; title: string; relevance: string }>;
  metadata: {
    totalExecutionTime: number;
    phases: Array<{ phase: string; executionTime: number }>;
  };
}

@Injectable()
export class Orchestrator {
  constructor(
    private plannerService: PlannerService,
    private logService: LogService,
    private eventEmitter: EventEmitter2,
    private eventCoordinator: EventCoordinatorService,
    private resultExtractor: ResultExtractorService,
    private evaluationCoordinator: EvaluationCoordinatorService,
    private phaseExecutorRegistry: PhaseExecutorRegistry,
  ) {}

  async executeResearch(
    query: string,
    logId?: string,
  ): Promise<ResearchResult> {
    logId = logId || randomUUID();
    const startTime = Date.now();
    const phaseMetrics: Array<{ phase: string; executionTime: number }> = [];

    // 1. PLANNING PHASE WITH EVALUATION FEEDBACK LOOP
    await this.eventCoordinator.emit(logId, 'session_started', { query });

    const MAX_PLAN_ATTEMPTS = 3;
    let plan = await this.plannerService.createPlan(query, logId);
    let planAttempt = 1;

    console.log(
      `[Orchestrator] Plan created with ${plan.phases.length} phases, evaluating...`,
    );

    // PLAN EVALUATION WITH FEEDBACK LOOP
    while (planAttempt <= MAX_PLAN_ATTEMPTS) {
      const searchQueries = this.resultExtractor.extractSearchQueries(plan);
      const evaluationResult = await this.evaluationCoordinator.evaluatePlan(
        logId,
        plan,
        searchQueries,
      );

      if (evaluationResult.passed || evaluationResult.evaluationSkipped) {
        console.log(
          `[Orchestrator] Plan evaluation passed on attempt ${planAttempt}`,
        );
        break;
      }

      // Plan failed evaluation - extract feedback and regenerate
      console.log(
        `[Orchestrator] Plan evaluation FAILED on attempt ${planAttempt}/${MAX_PLAN_ATTEMPTS}`,
      );

      if (planAttempt >= MAX_PLAN_ATTEMPTS) {
        console.log(
          `[Orchestrator] Max plan attempts (${MAX_PLAN_ATTEMPTS}) reached - proceeding with current plan`,
        );
        // Log warning that we're proceeding with a failing plan
        await this.eventCoordinator.emit(logId, 'plan_evaluation_warning', {
          message: `Plan failed evaluation after ${MAX_PLAN_ATTEMPTS} attempts - proceeding anyway`,
          finalScores: evaluationResult.scores,
          passed: false,
        });
        break;
      }

      // Extract feedback from evaluation result
      const lastAttempt =
        evaluationResult.attempts[evaluationResult.attempts.length - 1];
      const feedback = this.extractEvaluationFeedback(
        evaluationResult,
        lastAttempt,
        planAttempt,
      );

      console.log(
        `[Orchestrator] Regenerating plan with feedback: ${feedback.critique.substring(0, 100)}...`,
      );

      // Emit plan regeneration event
      await this.eventCoordinator.emit(logId, 'plan_regeneration_started', {
        attemptNumber: planAttempt + 1,
        previousScores: evaluationResult.scores,
        failingDimensions: feedback.failingDimensions,
        critique: feedback.critique,
      });

      // Regenerate plan with feedback
      plan = await this.plannerService.regeneratePlanWithFeedback(
        query,
        logId,
        feedback,
      );

      planAttempt++;
      console.log(
        `[Orchestrator] Plan regenerated (attempt ${planAttempt}), re-evaluating...`,
      );
    }

    console.log(
      `[Orchestrator] Plan finalized after ${planAttempt} attempt(s), entering execution loop...`,
    );

    // Log the FULL plan with all phases and steps
    await this.eventCoordinator.emit(logId, 'plan_created', {
      planId: plan.id,
      query: plan.query,
      status: plan.status,
      totalPhases: plan.phases.length,
      createdAt: plan.createdAt,
      // Full plan structure with all details
      phases: plan.phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
        description: phase.description,
        status: phase.status,
        order: phase.order,
        replanCheckpoint: phase.replanCheckpoint,
        totalSteps: phase.steps.length,
        steps: phase.steps.map((step) => ({
          id: step.id,
          toolName: step.toolName,
          type: step.type,
          config: step.config,
          dependencies: step.dependencies,
          status: step.status,
          order: step.order,
        })),
      })),
    });

    let finalOutput = '';
    const sources: Array<{ url: string; title: string; relevance: string }> =
      [];
    const allStepResults: StepResult[] = [];
    let retrievalEvaluationComplete = false;

    console.log(
      `[Orchestrator] Starting execution loop for ${plan.phases.length} phases`,
    );

    // 2. EXECUTION LOOP
    for (const phase of plan.phases) {
      console.log(
        `[Orchestrator] Processing phase: ${phase.name} (status: ${phase.status})`,
      );
      if (phase.status === 'skipped') continue;

      const phaseStartTime = Date.now();

      // Get appropriate executor for this phase
      const executor = this.phaseExecutorRegistry.getExecutor(phase);
      const phaseResult = await executor.execute(phase, {
        logId,
        plan,
        allPreviousResults: allStepResults,
      });

      phaseMetrics.push({
        phase: phase.name,
        executionTime: Date.now() - phaseStartTime,
      });

      // Accumulate step results across all phases
      allStepResults.push(...phaseResult.stepResults);

      // Store phase results for potential re-planning
      this.plannerService.setPhaseResults(phase.id, phaseResult);

      // Extract sources and final output
      const { sources: phaseSources, output: phaseOutput } =
        this.resultExtractor.extractAllResults(phaseResult);
      sources.push(...phaseSources);
      if (phaseOutput) {
        finalOutput = phaseOutput;
      }

      // RETRIEVAL EVALUATION - after retrieval phases (search/fetch)
      if (!retrievalEvaluationComplete && this.isRetrievalPhase(phase)) {
        const hasRetrievedContent = allStepResults.some(
          (r) => Array.isArray(r.output) && r.output.length > 0,
        );

        if (hasRetrievedContent) {
          try {
            await this.evaluationCoordinator.evaluateRetrieval(
              logId,
              plan.query,
              allStepResults,
            );
            retrievalEvaluationComplete = true;
          } catch (error) {
            console.error('[Orchestrator] Retrieval evaluation failed:', error);
            // Don't throw - evaluation failure shouldn't break research execution
          }
        }
      }

      // 3. RE-PLAN CHECKPOINT
      if (phase.replanCheckpoint && phaseResult.status === 'completed') {
        const stepsBeforeReplan = phase.steps.length;
        const { modified } = await this.plannerService.replan(
          plan,
          phase,
          phaseResult,
          logId,
        );
        if (modified) {
          // Check if steps were added to the current phase during replanning
          const stepsAfterReplan = phase.steps.length;
          if (stepsAfterReplan > stepsBeforeReplan) {
            // Re-execute the phase with the new steps using phase executor
            const replanExecutor =
              this.phaseExecutorRegistry.getExecutor(phase);
            const replanResult = await replanExecutor.execute(phase, {
              logId,
              plan,
              allPreviousResults: allStepResults,
            });

            // Merge results
            phaseResult.stepResults.push(...replanResult.stepResults);
            phaseResult.status = replanResult.status;
            if (replanResult.error) {
              phaseResult.error = replanResult.error;
            }

            if (replanResult.status !== 'failed') {
              // Update phase results for re-planning
              this.plannerService.setPhaseResults(phase.id, phaseResult);

              // Re-extract result data
              const { sources: phaseSources, output: phaseOutput } =
                this.resultExtractor.extractAllResults(phaseResult);
              sources.push(...phaseSources);
              if (phaseOutput) {
                finalOutput = phaseOutput;
              }
            }
          }
        }
      }

      // 4. FAILURE HANDLING
      if (phaseResult.status === 'failed') {
        const recovery = await this.handleFailure(
          plan,
          phase,
          phaseResult,
          logId,
        );
        if (recovery.action === 'abort') {
          await this.eventCoordinator.emit(logId, 'session_failed', {
            reason: recovery.reason,
          });
          throw new Error(`Research failed: ${recovery.reason}`);
        }
      }
    }

    // 5. ANSWER EVALUATION
    try {
      await this.evaluationCoordinator.evaluateAnswer(
        logId,
        plan.query,
        finalOutput,
        sources,
      );
    } catch (error) {
      console.error('[Orchestrator] Answer evaluation failed:', error);
      // Don't throw - evaluation failure shouldn't break research execution
    }

    // 6. COMPLETION
    const totalExecutionTime = Date.now() - startTime;

    await this.eventCoordinator.emit(logId, 'session_completed', {
      planId: plan.id,
      totalExecutionTime,
      phaseCount: plan.phases.length,
    });

    return {
      logId,
      planId: plan.id,
      answer: finalOutput,
      sources,
      metadata: {
        totalExecutionTime,
        phases: phaseMetrics,
      },
    };
  }

  private async handleFailure(
    plan: Plan,
    phase: Phase,
    phaseResult: PhaseResult,
    logId: string,
  ): Promise<RecoveryDecision> {
    const failedStep = phaseResult.stepResults.find(
      (r) => r.status === 'failed',
    );

    const failureContext: FailureContext = {
      planSummary: JSON.stringify({
        planId: plan.id,
        query: plan.query,
        phases: plan.phases.map((p) => ({ name: p.name, status: p.status })),
      }),
      failedPhase: phase.name,
      failedStep: failedStep
        ? {
            stepId: failedStep.stepId,
            toolName:
              phase.steps.find((s) => s.id === failedStep.stepId)?.toolName ||
              'unknown',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            config: failedStep.input,
            error: {
              message: failedStep.error?.message || 'Unknown error',
              stack: failedStep.error?.stack,
            },
          }
        : undefined,
      completedSteps: phaseResult.stepResults
        .filter((r) => r.status === 'completed')
        .map((r) => r.stepId),
      remainingPhases: plan.phases
        .filter((p) => p.status === 'pending')
        .map((p) => p.name),
    };

    return this.plannerService.decideRecovery(failureContext, logId);
  }

  private async emit(
    logId: string,
    eventType: LogEventType,
    data: Record<string, unknown>,
    phaseId?: string,
    stepId?: string,
  ): Promise<void> {
    const entry = await this.logService.append({
      logId,
      eventType,
      timestamp: new Date(),
      phaseId,
      stepId,
      data,
    });

    console.log(`[Orchestrator] Emitting event: log.${logId} - ${eventType}`);
    this.eventEmitter.emit(`log.${logId}`, entry);
    this.eventEmitter.emit('log.all', entry);
  }

  /**
   * Check if a phase is a retrieval phase (search/fetch)
   */
  private isRetrievalPhase(phase: Phase): boolean {
    const phaseName = phase.name.toLowerCase();
    return (
      phaseName.includes('search') ||
      phaseName.includes('fetch') ||
      phaseName.includes('gather') ||
      phaseName.includes('retriev')
    );
  }

  /**
   * Extract structured feedback from evaluation result for plan regeneration.
   * This extracts critique, failing dimensions, and specific issues from the
   * evaluation to provide actionable feedback to the planner.
   */
  private extractEvaluationFeedback(
    evaluationResult: {
      passed: boolean;
      scores: Record<string, number>;
      attempts: Array<{
        evaluatorResults: Array<{
          role: string;
          critique: string;
          explanation?: string;
        }>;
        iterationDecision?: {
          specificIssues: Array<{ issue: string; fix: string }>;
          feedbackToPlanner: string;
        };
      }>;
    },
    lastAttempt: {
      evaluatorResults: Array<{
        role: string;
        critique: string;
        explanation?: string;
      }>;
      iterationDecision?: {
        specificIssues: Array<{ issue: string; fix: string }>;
        feedbackToPlanner: string;
      };
    } | undefined,
    attemptNumber: number,
  ): {
    critique: string;
    specificIssues: Array<{ issue: string; fix: string }>;
    failingDimensions: string[];
    scores: Record<string, number>;
    attemptNumber: number;
  } {
    // Extract failing dimensions (scores below threshold)
    const PASS_THRESHOLD = 0.6;
    const failingDimensions = Object.entries(evaluationResult.scores)
      .filter(([_, score]) => score < PASS_THRESHOLD)
      .map(([dim, _]) => dim);

    // Extract critique from evaluator results
    let critique = '';
    const specificIssues: Array<{ issue: string; fix: string }> = [];

    if (lastAttempt) {
      // Collect critiques from all evaluators
      const critiques = lastAttempt.evaluatorResults
        .filter((r) => r.critique && r.critique.trim() !== '')
        .map((r) => `[${r.role}]: ${r.critique}`);

      critique = critiques.join('\n\n');

      // Use iteration decision if available
      if (lastAttempt.iterationDecision) {
        if (lastAttempt.iterationDecision.feedbackToPlanner) {
          critique =
            lastAttempt.iterationDecision.feedbackToPlanner + '\n\n' + critique;
        }
        if (lastAttempt.iterationDecision.specificIssues) {
          specificIssues.push(...lastAttempt.iterationDecision.specificIssues);
        }
      }
    }

    // If no critique was extracted, generate a generic one based on failing dimensions
    if (!critique || critique.trim() === '') {
      critique = `The plan failed evaluation. Failing dimensions: ${failingDimensions.join(', ')}. Please ensure the search queries directly address the user's question and use appropriate language/dates.`;
    }

    // Add specific issues for common failure patterns
    if (failingDimensions.includes('queryCoverage')) {
      specificIssues.push({
        issue: 'Search queries do not cover the key aspects of the user query',
        fix: 'Ensure all search queries directly relate to what the user is asking about',
      });
    }
    if (failingDimensions.includes('queryAccuracy')) {
      specificIssues.push({
        issue: 'Search queries do not accurately reflect the user intent',
        fix: 'Match the language and topic of the user query exactly',
      });
    }

    return {
      critique,
      specificIssues,
      failingDimensions,
      scores: evaluationResult.scores,
      attemptNumber,
    };
  }
}
