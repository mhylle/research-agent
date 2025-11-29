import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventCoordinatorService } from './event-coordinator.service';
import { LogService } from '../../logging/log.service';
import { Phase } from '../interfaces/phase.interface';

describe('EventCoordinatorService', () => {
  let service: EventCoordinatorService;
  let logService: jest.Mocked<LogService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventCoordinatorService,
        {
          provide: LogService,
          useValue: {
            append: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventCoordinatorService>(EventCoordinatorService);
    logService = module.get(LogService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('emit', () => {
    it('should append to log service and emit events', async () => {
      const mockEntry = { id: '1', logId: 'log1', eventType: 'test_event' };
      logService.append.mockResolvedValue(mockEntry as any);

      await service.emit('log1', 'test_event' as any, { test: 'data' });

      expect(logService.append).toHaveBeenCalledWith({
        logId: 'log1',
        eventType: 'test_event',
        timestamp: expect.any(Date),
        phaseId: undefined,
        stepId: undefined,
        data: { test: 'data' },
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('log.log1', mockEntry);
      expect(eventEmitter.emit).toHaveBeenCalledWith('log.all', mockEntry);
    });

    it('should include phaseId and stepId when provided', async () => {
      const mockEntry = { id: '1', logId: 'log1', eventType: 'test_event' };
      logService.append.mockResolvedValue(mockEntry as any);

      await service.emit(
        'log1',
        'step_started' as any,
        { test: 'data' },
        'phase1',
        'step1',
      );

      expect(logService.append).toHaveBeenCalledWith({
        logId: 'log1',
        eventType: 'step_started',
        timestamp: expect.any(Date),
        phaseId: 'phase1',
        stepId: 'step1',
        data: { test: 'data' },
      });
    });
  });

  describe('emitPhaseStarted', () => {
    it('should emit phase_started event with correct data', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Test Phase',
        steps: [{} as any, {} as any],
      } as Phase;

      logService.append.mockResolvedValue({} as any);

      await service.emitPhaseStarted('log1', phase);

      expect(logService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'phase_started',
          phaseId: 'phase1',
          data: expect.objectContaining({
            phaseId: 'phase1',
            phaseName: 'Test Phase',
            stepCount: 2,
          }),
        }),
      );
    });

    it('should include reason if provided', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Test Phase',
        steps: [],
      } as Phase;

      logService.append.mockResolvedValue({} as any);

      await service.emitPhaseStarted('log1', phase, 'replan_added_steps');

      expect(logService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: 'replan_added_steps',
          }),
        }),
      );
    });
  });

  describe('emitPhaseCompleted', () => {
    it('should emit phase_completed event with correct data', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Test Phase',
        steps: [{} as any, {} as any],
      } as Phase;

      logService.append.mockResolvedValue({} as any);

      await service.emitPhaseCompleted('log1', phase, 2);

      expect(logService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'phase_completed',
          phaseId: 'phase1',
          data: expect.objectContaining({
            phaseId: 'phase1',
            phaseName: 'Test Phase',
            stepsCompleted: 2,
          }),
        }),
      );
    });

    it('should include reason if provided', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Test Phase',
        steps: [],
      } as Phase;

      logService.append.mockResolvedValue({} as any);

      await service.emitPhaseCompleted('log1', phase, 0, 'all_steps_done');

      expect(logService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: 'all_steps_done',
          }),
        }),
      );
    });
  });

  describe('emitPhaseFailed', () => {
    it('should emit phase_failed event with error details', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Test Phase',
        steps: [],
      } as Phase;

      logService.append.mockResolvedValue({} as any);

      await service.emitPhaseFailed(
        'log1',
        phase,
        'step1',
        'Connection timeout',
      );

      expect(logService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'phase_failed',
          phaseId: 'phase1',
          data: expect.objectContaining({
            phaseId: 'phase1',
            phaseName: 'Test Phase',
            failedStepId: 'step1',
            error: 'Connection timeout',
          }),
        }),
      );
    });
  });
});
