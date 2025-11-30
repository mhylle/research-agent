// src/orchestration/phase-executors/fetch-phase-executor.ts
import { Injectable } from '@nestjs/common';
import { BasePhaseExecutor } from './base-phase-executor';
import { Phase, PhaseResult } from '../interfaces/phase.interface';
import { PhaseExecutionContext } from './interfaces/phase-execution-context';
import { EventCoordinatorService } from '../services/event-coordinator.service';
import { MilestoneService } from '../services/milestone.service';
import { ExecutorRegistry } from '../../executors/executor-registry.service';
import { StepConfigurationService } from '../services/step-configuration.service';
import { EvaluationCoordinatorService } from '../services/evaluation-coordinator.service';

/**
 * Executor for fetch/gather/content phases.
 * Triggers retrieval evaluation after successful execution.
 */
@Injectable()
export class FetchPhaseExecutor extends BasePhaseExecutor {
  constructor(
    eventCoordinator: EventCoordinatorService,
    milestoneService: MilestoneService,
    executorRegistry: ExecutorRegistry,
    stepConfiguration: StepConfigurationService,
    private readonly evaluationCoordinator: EvaluationCoordinatorService,
  ) {
    super(
      eventCoordinator,
      milestoneService,
      executorRegistry,
      stepConfiguration,
    );
  }

  /**
   * Handles phases with 'fetch', 'gather', or 'content' in the name
   */
  canHandle(phase: Phase): boolean {
    const phaseName = phase.name.toLowerCase();
    return (
      phaseName.includes('fetch') ||
      phaseName.includes('gather') ||
      phaseName.includes('content')
    );
  }

  /**
   * Execute fetch phase and trigger retrieval evaluation if successful
   */
  async execute(
    phase: Phase,
    context: PhaseExecutionContext,
  ): Promise<PhaseResult> {
    // Execute using base class logic
    const result = await super.execute(phase, context);

    // Trigger retrieval evaluation if phase succeeded
    if (result.status === 'completed') {
      await this.triggerRetrievalEvaluation(result, context);
    }

    return result;
  }

  /**
   * Trigger retrieval evaluation if retrieved content exists
   */
  private async triggerRetrievalEvaluation(
    result: PhaseResult,
    context: PhaseExecutionContext,
  ): Promise<void> {
    // Combine all previous results with current phase results
    const allResults = [...context.allPreviousResults, ...result.stepResults];

    // Check if any step has retrieved content (array output)
    const hasRetrievedContent = allResults.some(
      (r) => Array.isArray(r.output) && r.output.length > 0,
    );

    if (hasRetrievedContent) {
      try {
        await this.evaluationCoordinator.evaluateRetrieval(
          context.logId,
          context.plan.query,
          allResults,
        );
      } catch (error) {
        console.error(
          '[FetchPhaseExecutor] Retrieval evaluation failed:',
          error,
        );
        // Don't throw - evaluation failure shouldn't break research execution
      }
    }
  }
}
