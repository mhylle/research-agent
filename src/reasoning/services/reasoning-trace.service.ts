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
    console.log(`[ReasoningTraceService] emitThought: Starting - ${JSON.stringify({ logId, contentLength: content.length, context })}`);

    const thoughtId = randomUUID();
    console.log(`[ReasoningTraceService] emitThought: Generated thoughtId: ${thoughtId}`);

    const event: ThoughtEvent = {
      type: ReasoningEventType.THOUGHT,
      id: thoughtId,
      logId,
      timestamp: new Date(),
      content,
      context,
    };
    console.log(`[ReasoningTraceService] emitThought: Event object created`);

    console.log(`[ReasoningTraceService] emitThought: Before eventCoordinator.emit`);
    try {
      await this.eventCoordinator.emit(logId, 'reasoning_thought', {
        thoughtId,
        content,
        context,
      });
      console.log(`[ReasoningTraceService] emitThought: After eventCoordinator.emit - success`);
    } catch (error) {
      console.error(`[ReasoningTraceService] emitThought: eventCoordinator.emit FAILED - ${error.message}`, error.stack);
      throw error;
    }

    console.log(`[ReasoningTraceService] emitThought: Before researchLogger.log`);
    this.researchLogger.log(logId, 'reasoning', 'thought', {
      thoughtId,
      content,
      stage: context.stage,
    });
    console.log(`[ReasoningTraceService] emitThought: After researchLogger.log`);

    console.log(`[ReasoningTraceService] emitThought: Completed - returning thoughtId: ${thoughtId}`);
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
    console.log(`[ReasoningTraceService] emitObservation: Starting - ${JSON.stringify({ logId, actionId, resultLength: result.length, analysisLength: analysis.length })}`);

    const observationId = randomUUID();
    console.log(`[ReasoningTraceService] emitObservation: Generated observationId: ${observationId}`);

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
    console.log(`[ReasoningTraceService] emitObservation: Event object created`);

    console.log(`[ReasoningTraceService] emitObservation: Before eventCoordinator.emit`);
    try {
      await this.eventCoordinator.emit(logId, 'reasoning_observation', {
        observationId,
        actionId,
        result,
        analysis,
        implications,
      });
      console.log(`[ReasoningTraceService] emitObservation: After eventCoordinator.emit - success`);
    } catch (error) {
      console.error(`[ReasoningTraceService] emitObservation: eventCoordinator.emit FAILED - ${error.message}`, error.stack);
      throw error;
    }

    console.log(`[ReasoningTraceService] emitObservation: Before researchLogger.log`);
    this.researchLogger.log(logId, 'reasoning', 'observation', {
      observationId,
      actionId,
      analysis,
    });
    console.log(`[ReasoningTraceService] emitObservation: After researchLogger.log`);

    console.log(`[ReasoningTraceService] emitObservation: Completed - returning observationId: ${observationId}`);
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
