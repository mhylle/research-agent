// src/orchestration/orchestrator.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PlannerService } from './planner.service';
import { ExecutorRegistry } from '../executors/executor-registry.service';
import { LogService } from '../logging/log.service';
import { Plan } from './interfaces/plan.interface';
import { Phase, PhaseResult, StepResult } from './interfaces/phase.interface';
import { PlanStep } from './interfaces/plan-step.interface';
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
    private executorRegistry: ExecutorRegistry,
    private logService: LogService,
    private eventEmitter: EventEmitter2,
  ) {}

  async executeResearch(query: string, logId?: string): Promise<ResearchResult> {
    logId = logId || randomUUID();
    const startTime = Date.now();
    const phaseMetrics: Array<{ phase: string; executionTime: number }> = [];

    // 1. PLANNING PHASE
    await this.emit(logId, 'session_started', { query });

    const plan = await this.plannerService.createPlan(query, logId);

    console.log(`[Orchestrator] Plan created with ${plan.phases.length} phases, entering execution loop...`);

    // Log the FULL plan with all phases and steps
    await this.emit(logId, 'plan_created', {
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

    console.log(`[Orchestrator] Starting execution loop for ${plan.phases.length} phases`);

    // 2. EXECUTION LOOP
    for (const phase of plan.phases) {
      console.log(`[Orchestrator] Processing phase: ${phase.name} (status: ${phase.status})`);
      if (phase.status === 'skipped') continue;

      const phaseStartTime = Date.now();
      const phaseResult = await this.executePhase(phase, plan, logId, allStepResults);

      phaseMetrics.push({
        phase: phase.name,
        executionTime: Date.now() - phaseStartTime,
      });

      // Accumulate step results across all phases
      allStepResults.push(...phaseResult.stepResults);

      // Store phase results for potential re-planning
      this.plannerService.setPhaseResults(phase.id, phaseResult);

      // Extract sources and final output
      this.extractResultData(phaseResult, sources, (output) => {
        finalOutput = output;
      });

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
            await this.emit(logId, 'phase_started', {
              phaseId: phase.id,
              phaseName: phase.name,
              stepCount: phase.steps.length,
              reason: 'replan_added_steps',
            }, phase.id);

            // Execute only the new steps (those with pending status)
            const newSteps = phase.steps.filter(s => s.status === 'pending');
            const stepQueue = this.buildExecutionQueue(newSteps);

            for (const stepBatch of stepQueue) {
              const batchResults = await Promise.all(
                stepBatch.map((step) => this.executeStep(step, logId, plan, phaseResult.stepResults)),
              );
              phaseResult.stepResults.push(...batchResults);

              const failed = batchResults.find((r) => r.status === 'failed');
              if (failed) {
                phase.status = 'failed';
                await this.emit(logId, 'phase_failed', {
                  phaseId: phase.id,
                  phaseName: phase.name,
                  failedStepId: failed.stepId,
                  error: failed.error?.message,
                }, phase.id);
                phaseResult.status = 'failed';
                phaseResult.error = failed.error;
                break;
              }
            }

            if (phaseResult.status !== 'failed') {
              await this.emit(logId, 'phase_completed', {
                phaseId: phase.id,
                phaseName: phase.name,
                stepsCompleted: phaseResult.stepResults.length,
                reason: 'replan_execution',
              }, phase.id);

              // Update phase results for re-planning
              this.plannerService.setPhaseResults(phase.id, phaseResult);

              // Re-extract result data
              this.extractResultData(phaseResult, sources, (output) => {
                finalOutput = output;
              });
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
          await this.emit(logId, 'session_failed', { reason: recovery.reason });
          throw new Error(`Research failed: ${recovery.reason}`);
        }
      }
    }

    // 5. COMPLETION
    const totalExecutionTime = Date.now() - startTime;

    await this.emit(logId, 'session_completed', {
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

    await this.emit(
      logId,
      'phase_started',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepCount: phase.steps.length,
      },
      phase.id,
    );

    const stepResults: StepResult[] = [];
    const stepQueue = this.buildExecutionQueue(phase.steps);

    for (const stepBatch of stepQueue) {
      // Pass all previous results (from previous phases) + current phase results
      const contextResults = [...allPreviousResults, ...stepResults];
      const batchResults = await Promise.all(
        stepBatch.map((step) => this.executeStep(step, logId, plan, contextResults)),
      );
      stepResults.push(...batchResults);

      const failed = batchResults.find((r) => r.status === 'failed');
      if (failed) {
        phase.status = 'failed';
        await this.emit(
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
    await this.emit(
      logId,
      'phase_completed',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepsCompleted: stepResults.length,
      },
      phase.id,
    );

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

    await this.emit(
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

      await this.emit(
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

      await this.emit(
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

  private extractResultData(
    phaseResult: PhaseResult,
    sources: Array<{ url: string; title: string; relevance: string }>,
    setOutput: (output: string) => void,
  ): void {
    // Track synthesis outputs separately to prioritize them
    let synthesisOutput: string | null = null;
    let genericStringOutput: string | null = null;

    for (const stepResult of phaseResult.stepResults) {
      if (stepResult.output) {
        // Extract sources from search results
        if (Array.isArray(stepResult.output)) {
          for (const item of stepResult.output) {
            if (this.isSearchResultItem(item)) {
              const score = typeof item.score === 'number' ? item.score : 0;
              sources.push({
                url: item.url,
                title: item.title,
                relevance: score > 0.7 ? 'high' : 'medium',
              });
            }
          }
        }

        // Extract final answer - prioritize synthesis steps
        if (typeof stepResult.output === 'string' && stepResult.output.trim().length > 0) {
          // Check if this is a synthesis step (synthesis, synthesize, tavily_synthesize, etc.)
          const isSynthesisStep = stepResult.toolName &&
            (stepResult.toolName.toLowerCase().includes('synth') ||
             stepResult.toolName === 'llm');

          if (isSynthesisStep) {
            // Always prefer synthesis step output
            synthesisOutput = stepResult.output;
          } else if (!synthesisOutput && stepResult.output.length > 50) {
            // Fallback: use longer string outputs if no synthesis found
            genericStringOutput = stepResult.output;
          }
        }
      }
    }

    // Set the output, prioritizing synthesis results
    if (synthesisOutput) {
      setOutput(synthesisOutput);
    } else if (genericStringOutput) {
      setOutput(genericStringOutput);
    }
  }

  private isSearchResultItem(
    item: unknown,
  ): item is { url: string; title: string; score?: number } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'url' in item &&
      'title' in item &&
      typeof (item as Record<string, unknown>).url === 'string' &&
      typeof (item as Record<string, unknown>).title === 'string'
    );
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
}
