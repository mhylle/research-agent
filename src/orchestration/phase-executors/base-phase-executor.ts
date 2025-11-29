// src/orchestration/phase-executors/base-phase-executor.ts
import { Injectable } from '@nestjs/common';
import { IPhaseExecutor } from './interfaces/phase-executor.interface';
import { Phase, PhaseResult, StepResult } from '../interfaces/phase.interface';
import { PhaseExecutionContext } from './interfaces/phase-execution-context';
import { PlanStep } from '../interfaces/plan-step.interface';
import { EventCoordinatorService } from '../services/event-coordinator.service';
import { MilestoneService } from '../services/milestone.service';
import { ExecutorRegistry } from '../../executors/executor-registry.service';
import { StepConfigurationService } from '../services/step-configuration.service';

/**
 * Abstract base class for phase executors.
 * Provides default implementation of phase execution lifecycle:
 * 1. Emit phase started event
 * 2. Emit milestones
 * 3. Build execution queue based on dependencies
 * 4. Execute steps in parallel batches
 * 5. Handle failures
 * 6. Emit phase completed/failed events
 */
@Injectable()
export abstract class BasePhaseExecutor implements IPhaseExecutor {
  constructor(
    protected readonly eventCoordinator: EventCoordinatorService,
    protected readonly milestoneService: MilestoneService,
    protected readonly executorRegistry: ExecutorRegistry,
    protected readonly stepConfiguration: StepConfigurationService,
  ) {}

  /**
   * Subclasses must implement this to determine if they can handle a phase
   */
  abstract canHandle(phase: Phase): boolean;

  /**
   * Main execution method following the phase lifecycle
   * Can be overridden by subclasses for custom behavior
   */
  async execute(
    phase: Phase,
    context: PhaseExecutionContext,
  ): Promise<PhaseResult> {
    phase.status = 'running';

    // 1. Emit phase started event
    await this.eventCoordinator.emitPhaseStarted(context.logId, phase);

    // 2. Emit milestones for this phase
    await this.milestoneService.emitMilestonesForPhase(
      phase,
      context.logId,
      context.plan.query,
    );

    // 3. Execute steps
    const stepResults = await this.executeSteps(phase, context);

    // 4. Check for failures
    if (this.hasFailedSteps(stepResults)) {
      return this.handleFailure(phase, stepResults, context);
    }

    // 5. Mark phase as completed
    phase.status = 'completed';
    await this.eventCoordinator.emitPhaseCompleted(
      context.logId,
      phase,
      stepResults.length,
    );

    // 6. Emit phase completion milestone
    await this.milestoneService.emitPhaseCompletion(phase, context.logId);

    return { status: 'completed', stepResults };
  }

  /**
   * Execute all steps in the phase, respecting dependencies
   */
  protected async executeSteps(
    phase: Phase,
    context: PhaseExecutionContext,
  ): Promise<StepResult[]> {
    const stepResults: StepResult[] = [];
    const stepQueue = this.buildExecutionQueue(phase.steps);

    for (const stepBatch of stepQueue) {
      // Combine all previous results with current phase results for context
      const contextResults = [...context.allPreviousResults, ...stepResults];

      // Execute batch in parallel
      const batchResults = await Promise.all(
        stepBatch.map((step) =>
          this.executeStep(step, context, contextResults),
        ),
      );

      stepResults.push(...batchResults);

      // Stop execution if any step in batch failed
      if (this.hasFailedSteps(batchResults)) {
        break;
      }
    }

    return stepResults;
  }

  /**
   * Execute a single step with proper lifecycle management
   */
  protected async executeStep(
    step: PlanStep,
    context: PhaseExecutionContext,
    phaseResults: StepResult[],
  ): Promise<StepResult> {
    const startTime = Date.now();
    step.status = 'running';

    // Enrich synthesize steps with query and accumulated results
    if (step.toolName === 'synthesize') {
      this.stepConfiguration.enrichSynthesizeStep(
        step,
        context.plan,
        phaseResults,
      );
    }

    // Provide default config for tools if missing
    if (!step.config || Object.keys(step.config).length === 0) {
      step.config = this.stepConfiguration.getDefaultConfig(
        step.toolName,
        context.plan,
        phaseResults,
      );
    }

    // Emit step started event
    await this.eventCoordinator.emit(
      context.logId,
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
      // Execute the step
      const executor = this.executorRegistry.getExecutor(step.toolName);
      const result = await executor.execute(step, context.logId);
      const durationMs = Date.now() - startTime;

      step.status = 'completed';

      // Emit step completed event
      await this.eventCoordinator.emit(
        context.logId,
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
        toolName: step.toolName,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      step.status = 'failed';

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Emit step failed event
      await this.eventCoordinator.emit(
        context.logId,
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

  /**
   * Build execution queue respecting step dependencies
   * Returns array of batches where each batch can be executed in parallel
   */
  protected buildExecutionQueue(steps: PlanStep[]): PlanStep[][] {
    const queue: PlanStep[][] = [];
    const completed = new Set<string>();
    const remaining = [...steps];

    while (remaining.length > 0) {
      const batch: PlanStep[] = [];

      // Find all steps whose dependencies are satisfied
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

      // Handle circular dependencies or missing dependencies
      if (batch.length === 0 && remaining.length > 0) {
        // Execute remaining steps in order
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

  /**
   * Check if any steps in the results array have failed
   */
  protected hasFailedSteps(results: StepResult[]): boolean {
    return results.some((r) => r.status === 'failed');
  }

  /**
   * Handle phase failure
   */
  protected async handleFailure(
    phase: Phase,
    stepResults: StepResult[],
    context: PhaseExecutionContext,
  ): Promise<PhaseResult> {
    const failedStep = stepResults.find((r) => r.status === 'failed');

    phase.status = 'failed';
    await this.eventCoordinator.emitPhaseFailed(
      context.logId,
      phase,
      failedStep?.stepId || 'unknown',
      failedStep?.error?.message || 'Unknown error',
    );

    return {
      status: 'failed',
      stepResults,
      error: failedStep?.error,
    };
  }
}
