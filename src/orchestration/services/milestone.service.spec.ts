import { Test, TestingModule } from '@nestjs/testing';
import { MilestoneService } from './milestone.service';
import { EventCoordinatorService } from './event-coordinator.service';
import { Phase } from '../interfaces/phase.interface';

describe('MilestoneService', () => {
  let service: MilestoneService;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MilestoneService,
        {
          provide: EventCoordinatorService,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MilestoneService>(MilestoneService);
    eventCoordinator = module.get(EventCoordinatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('emitMilestonesForPhase', () => {
    it('should emit milestones for search phase', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      expect(eventCoordinator.emit).toHaveBeenCalled();
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'log1',
        'milestone_started',
        expect.objectContaining({
          stage: 1,
          status: 'running',
        }),
        'phase1',
      );
    });

    it('should emit milestones for fetch phase', async () => {
      const phase: Phase = {
        id: 'phase2',
        name: 'Fetch Content',
        steps: [{} as any, {} as any],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      expect(eventCoordinator.emit).toHaveBeenCalled();
      const firstCall = (eventCoordinator.emit as jest.Mock).mock.calls[0];
      expect(firstCall[1]).toBe('milestone_started');
      expect(firstCall[2]).toMatchObject({
        stage: 2,
        status: 'running',
      });
    });

    it('should emit milestones for synthesis phase', async () => {
      const phase: Phase = {
        id: 'phase3',
        name: 'Synthesize Answer',
        steps: [{} as any],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      expect(eventCoordinator.emit).toHaveBeenCalled();
      const firstCall = (eventCoordinator.emit as jest.Mock).mock.calls[0];
      expect(firstCall[1]).toBe('milestone_started');
      expect(firstCall[2]).toMatchObject({
        stage: 3,
        status: 'running',
      });
    });

    it('should not emit milestones for unknown phase type', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Unknown Phase',
        steps: [],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      expect(eventCoordinator.emit).not.toHaveBeenCalled();
    });

    it('should emit all milestones except the last one', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Initial Search',
        steps: [],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      // Stage 1 has 4 templates, should emit 3 (all except the last)
      expect(eventCoordinator.emit).toHaveBeenCalledTimes(3);
    });

    it('should include template data for identify_terms milestone', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [],
      } as Phase;

      await service.emitMilestonesForPhase(
        phase,
        'log1',
        'What is the latest news about AI?',
      );

      const identifyTermsCall = (eventCoordinator.emit as jest.Mock).mock.calls.find(
        (call) => call[2].templateId === 'stage1_identify_terms',
      );

      expect(identifyTermsCall).toBeDefined();
      expect(identifyTermsCall[2].templateData).toHaveProperty('terms');
      expect(typeof identifyTermsCall[2].templateData.terms).toBe('string');
    });

    it('should include count in template data for search milestone', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [{} as any, {} as any, {} as any],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      const searchCall = (eventCoordinator.emit as jest.Mock).mock.calls.find(
        (call) => call[2].templateId === 'stage1_search',
      );

      expect(searchCall).toBeDefined();
      expect(searchCall[2].templateData).toEqual({
        count: 3,
        sources: 'Tavily (web sources, news, articles)',
      });
    });

    it('should include count in template data for fetch milestone', async () => {
      const phase: Phase = {
        id: 'phase2',
        name: 'Fetch Content',
        steps: [{} as any, {} as any],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      const fetchCall = (eventCoordinator.emit as jest.Mock).mock.calls.find(
        (call) => call[2].templateId === 'stage2_fetch',
      );

      expect(fetchCall).toBeDefined();
      expect(fetchCall[2].templateData).toEqual({ count: 2 });
    });

    it('should format milestone description correctly', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [{} as any, {} as any],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      const searchCall = (eventCoordinator.emit as jest.Mock).mock.calls.find(
        (call) => call[2].templateId === 'stage1_search',
      );

      expect(searchCall[2].description).toBe(
        'Searching 2 databases: Tavily (web sources, news, articles)',
      );
    });
  });

  describe('emitPhaseCompletion', () => {
    it('should emit completion milestone for search phase', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [],
      } as Phase;

      await service.emitPhaseCompletion(phase, 'log1');

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'log1',
        'milestone_completed',
        expect.objectContaining({
          stage: 1,
          status: 'completed',
          templateId: 'stage1_filter',
        }),
        'phase1',
      );
    });

    it('should emit completion milestone for fetch phase', async () => {
      const phase: Phase = {
        id: 'phase2',
        name: 'Fetch Content',
        steps: [],
      } as Phase;

      await service.emitPhaseCompletion(phase, 'log1');

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'log1',
        'milestone_completed',
        expect.objectContaining({
          stage: 2,
          status: 'completed',
          templateId: 'stage2_validate',
        }),
        'phase2',
      );
    });

    it('should emit completion milestone for synthesis phase', async () => {
      const phase: Phase = {
        id: 'phase3',
        name: 'Synthesize Answer',
        steps: [],
      } as Phase;

      await service.emitPhaseCompletion(phase, 'log1');

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'log1',
        'milestone_completed',
        expect.objectContaining({
          stage: 3,
          status: 'completed',
          templateId: 'stage3_format',
        }),
        'phase3',
      );
    });

    it('should not emit milestone for unknown phase type', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Unknown Phase',
        steps: [],
      } as Phase;

      await service.emitPhaseCompletion(phase, 'log1');

      expect(eventCoordinator.emit).not.toHaveBeenCalled();
    });

    it('should use correct milestone ID format', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [],
      } as Phase;

      await service.emitPhaseCompletion(phase, 'log1');

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'log1',
        'milestone_completed',
        expect.objectContaining({
          milestoneId: 'phase1_stage1_filter',
        }),
        'phase1',
      );
    });
  });

  describe('phase type detection', () => {
    it('should detect search phase from various names', async () => {
      const searchNames = [
        'Search Phase',
        'Initial Query',
        'Query Processing',
        'search results',
      ];

      for (const name of searchNames) {
        const phase: Phase = { id: 'p1', name, steps: [] } as Phase;
        await service.emitMilestonesForPhase(phase, 'log1', 'test');
        expect(eventCoordinator.emit).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ stage: 1 }),
          expect.anything(),
        );
        jest.clearAllMocks();
      }
    });

    it('should detect fetch phase from various names', async () => {
      const fetchNames = [
        'Fetch Content',
        'Content Gathering',
        'Gather Sources',
        'fetch data',
      ];

      for (const name of fetchNames) {
        const phase: Phase = { id: 'p1', name, steps: [] } as Phase;
        await service.emitMilestonesForPhase(phase, 'log1', 'test');
        expect(eventCoordinator.emit).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ stage: 2 }),
          expect.anything(),
        );
        jest.clearAllMocks();
      }
    });

    it('should detect synthesis phase from various names', async () => {
      const synthesisNames = [
        'Synthesize Answer',
        'Generate Response',
        'synthesis phase',
        'answer generation',
      ];

      for (const name of synthesisNames) {
        const phase: Phase = { id: 'p1', name, steps: [] } as Phase;
        await service.emitMilestonesForPhase(phase, 'log1', 'test');
        expect(eventCoordinator.emit).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ stage: 3 }),
          expect.anything(),
        );
        jest.clearAllMocks();
      }
    });
  });

  describe('key term extraction', () => {
    it('should extract key terms and remove stop words', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [],
      } as Phase;

      await service.emitMilestonesForPhase(
        phase,
        'log1',
        'What are the latest developments in artificial intelligence?',
      );

      const identifyTermsCall = (eventCoordinator.emit as jest.Mock).mock.calls.find(
        (call) => call[2].templateId === 'stage1_identify_terms',
      );

      expect(identifyTermsCall).toBeDefined();
      const terms = identifyTermsCall[2].templateData.terms.split(', ');

      // Should not contain stop words
      expect(terms).not.toContain('the');
      expect(terms).not.toContain('are');
      expect(terms).not.toContain('in');

      // Should contain meaningful terms
      expect(terms.some((t: string) =>
        ['developments', 'artificial', 'intelligence'].includes(t)
      )).toBe(true);
    });

    it('should limit to 5 key terms', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [],
      } as Phase;

      await service.emitMilestonesForPhase(
        phase,
        'log1',
        'machine learning deep learning neural networks artificial intelligence computer vision natural language processing',
      );

      const identifyTermsCall = (eventCoordinator.emit as jest.Mock).mock.calls.find(
        (call) => call[2].templateId === 'stage1_identify_terms',
      );

      expect(identifyTermsCall).toBeDefined();
      const terms = identifyTermsCall[2].templateData.terms.split(', ');
      expect(terms.length).toBeLessThanOrEqual(5);
    });

    it('should sort terms by length (longer first)', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [],
      } as Phase;

      await service.emitMilestonesForPhase(
        phase,
        'log1',
        'AI artificial intelligence machine',
      );

      const identifyTermsCall = (eventCoordinator.emit as jest.Mock).mock.calls.find(
        (call) => call[2].templateId === 'stage1_identify_terms',
      );

      expect(identifyTermsCall).toBeDefined();
      const terms = identifyTermsCall[2].templateData.terms.split(', ');

      // Longer terms should come first
      if (terms.length > 1) {
        for (let i = 0; i < terms.length - 1; i++) {
          expect(terms[i].length).toBeGreaterThanOrEqual(terms[i + 1].length);
        }
      }
    });
  });
});
