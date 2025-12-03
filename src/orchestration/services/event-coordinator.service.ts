import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LogService } from '../../logging/log.service';
import { LogEventType } from '../../logging/interfaces/log-event-type.enum';
import { Phase } from '../interfaces/phase.interface';

@Injectable()
export class EventCoordinatorService {
  constructor(
    private readonly logService: LogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async emit(
    logId: string,
    eventType: LogEventType,
    data: Record<string, unknown>,
    phaseId?: string,
    stepId?: string,
  ): Promise<void> {
    console.log(`[EventCoordinatorService] emit: Starting - ${JSON.stringify({ logId, eventType, phaseId, stepId })}`);

    console.log(`[EventCoordinatorService] emit: Before logService.append`);
    try {
      const entry = await this.logService.append({
        logId,
        eventType,
        timestamp: new Date(),
        phaseId,
        stepId,
        data,
      });
      console.log(`[EventCoordinatorService] emit: After logService.append - entry: ${JSON.stringify({ id: entry.id, eventType: entry.eventType })}`);

      console.log(`[EventCoordinatorService] emit: Before eventEmitter.emit (log.${logId})`);
      this.eventEmitter.emit(`log.${logId}`, entry);
      console.log(`[EventCoordinatorService] emit: After eventEmitter.emit (log.${logId})`);

      console.log(`[EventCoordinatorService] emit: Before eventEmitter.emit (log.all)`);
      this.eventEmitter.emit('log.all', entry);
      console.log(`[EventCoordinatorService] emit: After eventEmitter.emit (log.all)`);

      console.log(`[EventCoordinatorService] emit: Completed successfully`);
    } catch (error) {
      console.error(`[EventCoordinatorService] emit: FAILED - ${error.message}`, error.stack);
      throw error;
    }
  }

  async emitPhaseStarted(
    logId: string,
    phase: Phase,
    reason?: string,
  ): Promise<void> {
    await this.emit(
      logId,
      'phase_started',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepCount: phase.steps.length,
        ...(reason && { reason }),
      },
      phase.id,
    );
  }

  async emitPhaseCompleted(
    logId: string,
    phase: Phase,
    stepsCompleted: number,
    reason?: string,
  ): Promise<void> {
    await this.emit(
      logId,
      'phase_completed',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepsCompleted,
        ...(reason && { reason }),
      },
      phase.id,
    );
  }

  async emitPhaseFailed(
    logId: string,
    phase: Phase,
    failedStepId: string,
    error: string,
  ): Promise<void> {
    await this.emit(
      logId,
      'phase_failed',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        failedStepId,
        error,
      },
      phase.id,
    );
  }
}
