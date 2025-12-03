import { Test, TestingModule } from '@nestjs/testing';
import { ReasoningTraceService } from './reasoning-trace.service';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import {
  ReasoningEventType,
  ThoughtContext,
} from '../interfaces/reasoning-events.interface';

describe('ReasoningTraceService', () => {
  let service: ReasoningTraceService;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;
  let researchLogger: jest.Mocked<ResearchLogger>;

  beforeEach(async () => {
    const mockEventCoordinator = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const mockResearchLogger = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReasoningTraceService,
        {
          provide: EventCoordinatorService,
          useValue: mockEventCoordinator,
        },
        {
          provide: ResearchLogger,
          useValue: mockResearchLogger,
        },
      ],
    }).compile();

    service = module.get<ReasoningTraceService>(ReasoningTraceService);
    eventCoordinator = module.get(EventCoordinatorService);
    researchLogger = module.get(ResearchLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('emitThought', () => {
    it('should emit thought event with correct data', async () => {
      const logId = 'test-log-id';
      const content = 'This is a test thought';
      const context: ThoughtContext = {
        stage: 'planning',
        step: 1,
        relatedTo: 'previous-thought-id',
      };

      const thoughtId = await service.emitThought(logId, content, context);

      expect(thoughtId).toBeDefined();
      expect(typeof thoughtId).toBe('string');
      expect(thoughtId.length).toBeGreaterThan(0);

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_thought',
        expect.objectContaining({
          thoughtId,
          content,
          context,
        }),
      );

      expect(researchLogger.log).toHaveBeenCalledWith(
        logId,
        'reasoning',
        'thought',
        expect.objectContaining({
          thoughtId,
          content,
          stage: context.stage,
        }),
      );
    });

    it('should emit thought event without relatedTo field', async () => {
      const logId = 'test-log-id';
      const content = 'Independent thought';
      const context: ThoughtContext = {
        stage: 'execution',
        step: 2,
      };

      const thoughtId = await service.emitThought(logId, content, context);

      expect(thoughtId).toBeDefined();
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_thought',
        expect.objectContaining({
          thoughtId,
          content,
          context,
        }),
      );
    });
  });

  describe('emitActionPlan', () => {
    it('should emit action plan event with correct data', async () => {
      const logId = 'test-log-id';
      const action = 'Search for information';
      const tool = 'tavily_search';
      const parameters = { query: 'test query', max_results: 5 };
      const reasoning = 'Need to gather initial information';

      const actionId = await service.emitActionPlan(
        logId,
        action,
        tool,
        parameters,
        reasoning,
      );

      expect(actionId).toBeDefined();
      expect(typeof actionId).toBe('string');

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_action_planned',
        expect.objectContaining({
          actionId,
          action,
          tool,
          parameters,
          reasoning,
        }),
      );

      expect(researchLogger.log).toHaveBeenCalledWith(
        logId,
        'reasoning',
        'action_planned',
        expect.objectContaining({
          actionId,
          action,
          tool,
        }),
      );
    });

    it('should handle complex parameters in action plan', async () => {
      const logId = 'test-log-id';
      const complexParams = {
        query: 'complex query',
        filters: { date: '2024-01', category: 'science' },
        options: { limit: 10, sort: 'relevance' },
      };

      const actionId = await service.emitActionPlan(
        logId,
        'Advanced search',
        'custom_tool',
        complexParams,
        'Complex search requirements',
      );

      expect(actionId).toBeDefined();
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_action_planned',
        expect.objectContaining({
          parameters: complexParams,
        }),
      );
    });
  });

  describe('emitObservation', () => {
    it('should emit observation event with correct data', async () => {
      const logId = 'test-log-id';
      const actionId = 'action-123';
      const result = 'Search returned 5 results';
      const analysis = 'Results are highly relevant';
      const implications = [
        'Can proceed with synthesis',
        'No need for additional searches',
      ];

      const observationId = await service.emitObservation(
        logId,
        actionId,
        result,
        analysis,
        implications,
      );

      expect(observationId).toBeDefined();
      expect(typeof observationId).toBe('string');

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_observation',
        expect.objectContaining({
          observationId,
          actionId,
          result,
          analysis,
          implications,
        }),
      );

      expect(researchLogger.log).toHaveBeenCalledWith(
        logId,
        'reasoning',
        'observation',
        expect.objectContaining({
          observationId,
          actionId,
          analysis,
        }),
      );
    });

    it('should handle empty implications array', async () => {
      const logId = 'test-log-id';
      const actionId = 'action-123';
      const result = 'No results found';
      const analysis = 'Search query needs refinement';
      const implications: string[] = [];

      const observationId = await service.emitObservation(
        logId,
        actionId,
        result,
        analysis,
        implications,
      );

      expect(observationId).toBeDefined();
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_observation',
        expect.objectContaining({
          implications: [],
        }),
      );
    });
  });

  describe('emitConclusion', () => {
    it('should emit conclusion event with next steps', async () => {
      const logId = 'test-log-id';
      const conclusion = 'Research phase is complete';
      const supportingThoughts = ['thought-1', 'thought-2', 'thought-3'];
      const confidence = 0.95;
      const nextSteps = [
        'Begin synthesis phase',
        'Generate final report',
      ];

      const conclusionId = await service.emitConclusion(
        logId,
        conclusion,
        supportingThoughts,
        confidence,
        nextSteps,
      );

      expect(conclusionId).toBeDefined();
      expect(typeof conclusionId).toBe('string');

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_conclusion',
        expect.objectContaining({
          conclusionId,
          conclusion,
          supportingThoughts,
          confidence,
          nextSteps,
        }),
      );

      expect(researchLogger.log).toHaveBeenCalledWith(
        logId,
        'reasoning',
        'conclusion',
        expect.objectContaining({
          conclusionId,
          conclusion,
          confidence,
        }),
      );
    });

    it('should emit conclusion event without next steps', async () => {
      const logId = 'test-log-id';
      const conclusion = 'Analysis complete';
      const supportingThoughts = ['thought-1'];
      const confidence = 0.8;

      const conclusionId = await service.emitConclusion(
        logId,
        conclusion,
        supportingThoughts,
        confidence,
      );

      expect(conclusionId).toBeDefined();
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_conclusion',
        expect.objectContaining({
          conclusionId,
          conclusion,
          supportingThoughts,
          confidence,
          nextSteps: undefined,
        }),
      );
    });

    it('should handle low confidence conclusions', async () => {
      const logId = 'test-log-id';
      const conclusion = 'Tentative conclusion';
      const supportingThoughts = ['thought-1'];
      const confidence = 0.3;

      const conclusionId = await service.emitConclusion(
        logId,
        conclusion,
        supportingThoughts,
        confidence,
      );

      expect(conclusionId).toBeDefined();
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_conclusion',
        expect.objectContaining({
          confidence: 0.3,
        }),
      );
    });

    it('should handle empty supporting thoughts', async () => {
      const logId = 'test-log-id';
      const conclusion = 'Direct conclusion';
      const supportingThoughts: string[] = [];
      const confidence = 1.0;

      const conclusionId = await service.emitConclusion(
        logId,
        conclusion,
        supportingThoughts,
        confidence,
      );

      expect(conclusionId).toBeDefined();
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_conclusion',
        expect.objectContaining({
          supportingThoughts: [],
        }),
      );
    });
  });

  describe('UUID generation', () => {
    it('should generate unique IDs for each event type', async () => {
      const logId = 'test-log-id';

      const thoughtId1 = await service.emitThought(logId, 'thought 1', {
        stage: 'test',
        step: 1,
      });
      const thoughtId2 = await service.emitThought(logId, 'thought 2', {
        stage: 'test',
        step: 2,
      });

      const actionId = await service.emitActionPlan(
        logId,
        'test action',
        'test_tool',
        {},
        'test reasoning',
      );

      const observationId = await service.emitObservation(
        logId,
        actionId,
        'test result',
        'test analysis',
        [],
      );

      const conclusionId = await service.emitConclusion(
        logId,
        'test conclusion',
        [],
        0.5,
      );

      const ids = [
        thoughtId1,
        thoughtId2,
        actionId,
        observationId,
        conclusionId,
      ];
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('error handling', () => {
    it('should propagate errors from eventCoordinator', async () => {
      const error = new Error('Event emission failed');
      eventCoordinator.emit.mockRejectedValueOnce(error);

      await expect(
        service.emitThought('log-id', 'test', { stage: 'test', step: 1 }),
      ).rejects.toThrow('Event emission failed');
    });

    it('should handle ResearchLogger errors gracefully', async () => {
      researchLogger.log.mockImplementationOnce(() => {
        throw new Error('Logging failed');
      });

      // The service doesn't catch logger errors, so they should propagate
      await expect(
        service.emitThought('log-id', 'test', { stage: 'test', step: 1 }),
      ).rejects.toThrow('Logging failed');
    });
  });
});
