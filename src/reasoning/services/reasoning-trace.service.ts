import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import {
  ReasoningEventType,
  ThoughtContext,
  ThoughtEvent,
  ActionPlannedEvent,
  ObservationEvent,
  ConclusionEvent,
} from '../interfaces/reasoning-events.interface';

@Injectable()
export class ReasoningTraceService {
  constructor(
    private readonly eventCoordinator: EventCoordinatorService,
    private readonly researchLogger: ResearchLogger,
  ) {}

  async emitThought(
    logId: string,
    content: string,
    context: ThoughtContext,
  ): Promise<string> {
    const thoughtId = randomUUID();
    const event: ThoughtEvent = {
      type: ReasoningEventType.THOUGHT,
      id: thoughtId,
      logId,
      timestamp: new Date(),
      content,
      context,
    };

    await this.eventCoordinator.emit(logId, 'reasoning_thought', {
      thoughtId,
      content,
      context,
    });
    this.researchLogger.log(logId, 'reasoning', 'thought', {
      thoughtId,
      content,
      stage: context.stage,
    });

    return thoughtId;
  }

  async emitActionPlan(
    logId: string,
    action: string,
    tool: string,
    parameters: Record<string, unknown>,
    reasoning: string,
  ): Promise<string> {
    const actionId = randomUUID();
    const event: ActionPlannedEvent = {
      type: ReasoningEventType.ACTION_PLANNED,
      id: actionId,
      logId,
      timestamp: new Date(),
      action,
      tool,
      parameters,
      reasoning,
    };

    await this.eventCoordinator.emit(logId, 'reasoning_action_planned', {
      actionId,
      action,
      tool,
      parameters,
      reasoning,
    });
    this.researchLogger.log(logId, 'reasoning', 'action_planned', {
      actionId,
      action,
      tool,
    });

    return actionId;
  }

  async emitObservation(
    logId: string,
    actionId: string,
    result: string,
    analysis: string,
    implications: string[],
  ): Promise<string> {
    const observationId = randomUUID();
    const event: ObservationEvent = {
      type: ReasoningEventType.OBSERVATION,
      id: observationId,
      logId,
      timestamp: new Date(),
      actionId,
      result,
      analysis,
      implications,
    };

    await this.eventCoordinator.emit(logId, 'reasoning_observation', {
      observationId,
      actionId,
      result,
      analysis,
      implications,
    });
    this.researchLogger.log(logId, 'reasoning', 'observation', {
      observationId,
      actionId,
      analysis,
    });

    return observationId;
  }

  async emitConclusion(
    logId: string,
    conclusion: string,
    supportingThoughts: string[],
    confidence: number,
    nextSteps?: string[],
  ): Promise<string> {
    const conclusionId = randomUUID();
    const event: ConclusionEvent = {
      type: ReasoningEventType.CONCLUSION,
      id: conclusionId,
      logId,
      timestamp: new Date(),
      conclusion,
      supportingThoughts,
      confidence,
      nextSteps,
    };

    await this.eventCoordinator.emit(logId, 'reasoning_conclusion', {
      conclusionId,
      conclusion,
      supportingThoughts,
      confidence,
      nextSteps,
    });
    this.researchLogger.log(logId, 'reasoning', 'conclusion', {
      conclusionId,
      conclusion,
      confidence,
    });

    return conclusionId;
  }
}
