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

    // 1. PLANNING PHASE
    await this.eventCoordinator.emit(logId, 'session_started', { query });

    const plan = await this.plannerService.createPlan(query, logId);

    console.log(
      `[Orchestrator] Plan created with ${plan.phases.length} phases, entering execution loop...`,
    );

    // PLAN EVALUATION
    const searchQueries = this.resultExtractor.extractSearchQueries(plan);
    await this.evaluationCoordinator.evaluatePlan(logId, plan, searchQueries);

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
            const replanExecutor = this.phaseExecutorRegistry.getExecutor(phase);
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

}
