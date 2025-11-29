// src/orchestration/orchestrator.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PlannerService } from './planner.service';
import { ExecutorRegistry } from '../executors/executor-registry.service';
import { LogService } from '../logging/log.service';
import { EventCoordinatorService } from './services/event-coordinator.service';
import { MilestoneService } from './services/milestone.service';
import { ResultExtractorService } from './services/result-extractor.service';
import { Plan } from './interfaces/plan.interface';
import { Phase, PhaseResult, StepResult } from './interfaces/phase.interface';
import { PlanStep } from './interfaces/plan-step.interface';
import { LogEventType } from '../logging/interfaces/log-event-type.enum';
import {
  FailureContext,
  RecoveryDecision,
} from './interfaces/recovery.interface';
import { PlanEvaluationOrchestratorService } from '../evaluation/services/plan-evaluation-orchestrator.service';
import { EvaluationService } from '../evaluation/services/evaluation.service';
import { RetrievalEvaluatorService } from '../evaluation/services/retrieval-evaluator.service';
import { AnswerEvaluatorService } from '../evaluation/services/answer-evaluator.service';

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
    private executorRegistry: ExecutorRegistry,
    private logService: LogService,
    private eventEmitter: EventEmitter2,
    private eventCoordinator: EventCoordinatorService,
    private milestoneService: MilestoneService,
    private resultExtractor: ResultExtractorService,
    private planEvaluationOrchestrator: PlanEvaluationOrchestratorService,
    private evaluationService: EvaluationService,
    private retrievalEvaluator: RetrievalEvaluatorService,
    private answerEvaluator: AnswerEvaluatorService,
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
    console.log('[Orchestrator] Starting plan evaluation...');
    await this.eventCoordinator.emit(logId, 'evaluation_started', {
      phase: 'plan',
      query: plan.query,
    });
    console.log('[Orchestrator] evaluation_started event emitted');

    console.log(
      '[Orchestrator] Calling planEvaluationOrchestrator.evaluatePlan...',
    );
    const evaluationResult = await this.planEvaluationOrchestrator.evaluatePlan(
      {
        query: plan.query,
        plan: {
          id: plan.id,
          phases: plan.phases,
          searchQueries: this.resultExtractor.extractSearchQueries(plan),
        },
      },
    );
    console.log(
      '[Orchestrator] Plan evaluation completed:',
      JSON.stringify(evaluationResult, null, 2),
    );

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
    console.log('[Orchestrator] Saving evaluation record to database...');
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
      console.log('[Orchestrator] Evaluation record saved successfully');
    } catch (error) {
      console.error('[Orchestrator] Failed to save evaluation record:', error);
      // Don't throw - evaluation storage failure shouldn't break research execution
    }

    // Log evaluation result for user visibility
    if (!evaluationResult.evaluationSkipped) {
      const scoresSummary = Object.entries(evaluationResult.scores)
        .map(([dim, score]) => `${dim}: ${(score * 100).toFixed(0)}%`)
        .join(', ');

      console.log(
        `[Orchestrator] Plan evaluation: ${evaluationResult.passed ? 'PASSED' : 'FAILED'} (${scoresSummary})`,
      );
    }

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
      const phaseResult = await this.executePhase(
        phase,
        plan,
        logId,
        allStepResults,
      );

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
          console.log('[Orchestrator] Starting retrieval evaluation...');
          await this.eventCoordinator.emit(logId, 'evaluation_started', {
            phase: 'retrieval',
            query: plan.query,
          });

          try {
            const retrievalContent =
              this.resultExtractor.collectRetrievalContent(allStepResults);
            const retrievalEvalResult = await this.retrievalEvaluator.evaluate({
              query: plan.query,
              retrievedContent: retrievalContent,
            });

            console.log(
              '[Orchestrator] Retrieval evaluation completed:',
              JSON.stringify(retrievalEvalResult, null, 2),
            );

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
            await this.evaluationService.updateEvaluationRecord(logId, {
              retrievalEvaluation: {
                scores: retrievalEvalResult.scores,
                explanations: retrievalEvalResult.explanations || {},
                passed: retrievalEvalResult.passed,
                flaggedSevere: retrievalEvalResult.flaggedSevere,
                sourceDetails: retrievalEvalResult.sourceDetails,
              },
            });

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
            // Re-execute the phase with the new steps
            await this.eventCoordinator.emit(
              logId,
              'phase_started',
              {
                phaseId: phase.id,
                phaseName: phase.name,
                stepCount: phase.steps.length,
                reason: 'replan_added_steps',
              },
              phase.id,
            );

            // Execute only the new steps (those with pending status)
            const newSteps = phase.steps.filter((s) => s.status === 'pending');
            const stepQueue = this.buildExecutionQueue(newSteps);

            for (const stepBatch of stepQueue) {
              const batchResults = await Promise.all(
                stepBatch.map((step) =>
                  this.executeStep(step, logId, plan, phaseResult.stepResults),
                ),
              );
              phaseResult.stepResults.push(...batchResults);

              const failed = batchResults.find((r) => r.status === 'failed');
              if (failed) {
                phase.status = 'failed';
                await this.eventCoordinator.emit(
                  logId,
                  'phase_failed',
                  {
                    phaseId: phase.id,
                    phaseName: phase.name,
                    failedStepId: failed.stepId,
                    error: failed.error?.message,
                  },
                  phase.id,
                );
                phaseResult.status = 'failed';
                phaseResult.error = failed.error;
                break;
              }
            }

            if (phaseResult.status !== 'failed') {
              await this.eventCoordinator.emit(
                logId,
                'phase_completed',
                {
                  phaseId: phase.id,
                  phaseName: phase.name,
                  stepsCompleted: phaseResult.stepResults.length,
                  reason: 'replan_execution',
                },
                phase.id,
              );

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
    console.log('[Orchestrator] Starting answer evaluation phase');
    try {
      const answerEvalResult = await this.answerEvaluator.evaluate({
        query: plan.query,
        answer: finalOutput,
        sources: sources.map((s) => ({
          url: s.url,
          content: '', // Content not stored in sources array
          title: s.title,
        })),
      });

      console.log(
        '[Orchestrator] Answer evaluation completed:',
        JSON.stringify(answerEvalResult, null, 2),
      );

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

  private async executePhase(
    phase: Phase,
    plan: Plan,
    logId: string,
    allPreviousResults: StepResult[] = [],
  ): Promise<PhaseResult> {
    phase.status = 'running';

    await this.eventCoordinator.emit(
      logId,
      'phase_started',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepCount: phase.steps.length,
      },
      phase.id,
    );

    // Emit milestones for this phase
    await this.milestoneService.emitMilestonesForPhase(
      phase,
      logId,
      plan.query,
    );

    const stepResults: StepResult[] = [];
    const stepQueue = this.buildExecutionQueue(phase.steps);

    for (const stepBatch of stepQueue) {
      // Pass all previous results (from previous phases) + current phase results
      const contextResults = [...allPreviousResults, ...stepResults];
      const batchResults = await Promise.all(
        stepBatch.map((step) =>
          this.executeStep(step, logId, plan, contextResults),
        ),
      );
      stepResults.push(...batchResults);

      const failed = batchResults.find((r) => r.status === 'failed');
      if (failed) {
        phase.status = 'failed';
        await this.eventCoordinator.emit(
          logId,
          'phase_failed',
          {
            phaseId: phase.id,
            phaseName: phase.name,
            failedStepId: failed.stepId,
            error: failed.error?.message,
          },
          phase.id,
        );
        return { status: 'failed', stepResults, error: failed.error };
      }
    }

    phase.status = 'completed';
    await this.eventCoordinator.emit(
      logId,
      'phase_completed',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepsCompleted: stepResults.length,
      },
      phase.id,
    );

    // Emit final milestone for the completed phase
    await this.milestoneService.emitPhaseCompletion(phase, logId);

    return { status: 'completed', stepResults };
  }

  private async executeStep(
    step: PlanStep,
    logId: string,
    plan?: Plan,
    phaseResults?: StepResult[],
  ): Promise<StepResult> {
    const startTime = Date.now();
    step.status = 'running';

    // Enrich synthesize steps with query and accumulated results
    if (step.toolName === 'synthesize' && plan && phaseResults) {
      this.enrichSynthesizeStep(step, plan, phaseResults);
    }

    // Provide default config for tools if missing
    if (!step.config || Object.keys(step.config).length === 0) {
      step.config = this.getDefaultConfig(step.toolName, plan, phaseResults);
    }

    await this.eventCoordinator.emit(
      logId,
      'step_started',
      {
        stepId: step.id,
        toolName: step.toolName,
        type: step.type,
        config: step.config,
      },
      step.phaseId,
      step.id,
    );

    try {
      const executor = this.executorRegistry.getExecutor(step.toolName);
      const result = await executor.execute(step, logId);
      const durationMs = Date.now() - startTime;

      step.status = 'completed';

      await this.eventCoordinator.emit(
        logId,
        'step_completed',
        {
          stepId: step.id,
          toolName: step.toolName,
          input: step.config,
          output: result.output,
          tokensUsed: result.tokensUsed,
          durationMs,
          metadata: result.metadata,
        },
        step.phaseId,
        step.id,
      );

      return {
        status: 'completed',
        stepId: step.id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        output: result.output,
        input: step.config,
        toolName: step.toolName, // Include toolName to identify synthesis steps
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      step.status = 'failed';

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      await this.eventCoordinator.emit(
        logId,
        'step_failed',
        {
          stepId: step.id,
          toolName: step.toolName,
          input: step.config,
          error: {
            message: errorMessage,
            stack: errorStack,
          },
          durationMs,
        },
        step.phaseId,
        step.id,
      );

      return {
        status: 'failed',
        stepId: step.id,
        error: error as Error,
        input: step.config,
        toolName: step.toolName,
      };
    }
  }

  private buildExecutionQueue(steps: PlanStep[]): PlanStep[][] {
    const queue: PlanStep[][] = [];
    const completed = new Set<string>();
    const remaining = [...steps];

    while (remaining.length > 0) {
      const batch: PlanStep[] = [];

      for (let i = remaining.length - 1; i >= 0; i--) {
        const step = remaining[i];
        const depsComplete = step.dependencies.every((dep) =>
          completed.has(dep),
        );

        if (depsComplete) {
          batch.push(step);
          remaining.splice(i, 1);
        }
      }

      if (batch.length === 0 && remaining.length > 0) {
        // Circular dependency or missing dependency - execute remaining in order
        batch.push(...remaining);
        remaining.length = 0;
      }

      if (batch.length > 0) {
        queue.push(batch);
        batch.forEach((s) => completed.add(s.id));
      }
    }

    return queue;
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

  private getDefaultConfig(
    toolName: string,
    plan?: Plan,
    phaseResults?: StepResult[],
  ): Record<string, unknown> {
    switch (toolName) {
      case 'tavily_search':
        // Default to searching for the main query
        return { query: plan?.query || 'research query', max_results: 5 };

      case 'web_fetch':
        // Try to get URL from previous search results
        if (phaseResults) {
          for (const result of phaseResults) {
            if (Array.isArray(result.output)) {
              for (const item of result.output) {
                if (item && typeof item === 'object' && 'url' in item) {
                  return { url: item.url };
                }
              }
            }
          }
        }
        // Fallback: return empty config (will cause tool to fail gracefully)
        return {};

      default:
        return {};
    }
  }

  private enrichSynthesizeStep(
    step: PlanStep,
    plan: Plan,
    accumulatedResults: StepResult[],
  ): void {
    // Build context from all previous phase results
    const searchResults: unknown[] = [];
    const fetchResults: string[] = [];

    for (const result of accumulatedResults) {
      if (result.status === 'completed' && result.output) {
        // Collect search results (arrays of search result objects)
        if (Array.isArray(result.output)) {
          searchResults.push(...result.output);
        }
        // Collect fetch results (string content)
        else if (typeof result.output === 'string') {
          fetchResults.push(result.output);
        }
      }
    }

    // Build a comprehensive context string
    let contextString = '';

    if (searchResults.length > 0) {
      contextString += '## Search Results\n\n';
      contextString += JSON.stringify(searchResults, null, 2);
      contextString += '\n\n';
    }

    if (fetchResults.length > 0) {
      contextString += '## Fetched Content\n\n';
      contextString += fetchResults.join('\n\n---\n\n');
    }

    // Enrich the step config (with null safety)
    const existingConfig = step.config || {};
    step.config = {
      ...existingConfig,
      query: plan.query,
      context: contextString,
      systemPrompt:
        existingConfig.systemPrompt ||
        'You are a research synthesis assistant. Analyze the provided search results and fetched content to answer the user query comprehensively.',
      prompt:
        existingConfig.prompt ||
        `Based on the research query and gathered information, provide a comprehensive answer.\n\nQuery: ${plan.query}`,
    };
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
