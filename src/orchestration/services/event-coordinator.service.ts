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
    const entry = await this.logService.append({
      logId,
      eventType,
      timestamp: new Date(),
      phaseId,
      stepId,
      data,
    });

    this.eventEmitter.emit(`log.${logId}`, entry);
    this.eventEmitter.emit('log.all', entry);
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
