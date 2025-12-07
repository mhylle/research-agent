import { Test, TestingModule } from '@nestjs/testing';
import { WorkingMemoryService } from './working-memory.service';
import { WorkingMemory } from '../interfaces/working-memory.interface';

describe('WorkingMemoryService', () => {
  let service: WorkingMemoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkingMemoryService],
    }).compile();

    service = module.get<WorkingMemoryService>(WorkingMemoryService);
  });

  afterEach(() => {
    // Clean up all memories after each test
    service.cleanup('test-log-id');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialize', () => {
    it('should create proper working memory structure', () => {
      const query = 'What is quantum computing?';
      const logId = 'test-log-id';

      const memory = service.initialize(logId, query);

      expect(memory).toBeDefined();
      expect(memory.taskId).toBeDefined();
      expect(memory.logId).toBe(logId);
      expect(memory.query).toBe(query);
      expect(memory.startTime).toBeInstanceOf(Date);
      expect(memory.currentPhase).toBe('initialization');
      expect(memory.currentStep).toBe(0);
      expect(memory.primaryGoal).toBe(`Answer the query: "${query}"`);
      expect(memory.subGoals).toEqual([]);
      expect(memory.gatheredInformation).toEqual([]);
      expect(memory.activeHypotheses).toEqual([]);
      expect(memory.identifiedGaps).toEqual([]);
      expect(memory.scratchPad).toBeInstanceOf(Map);
      expect(memory.thoughtChain).toEqual([]);
    });

    it('should store memory and allow retrieval', () => {
      const logId = 'test-log-id';
      const query = 'Test query';

      const initializedMemory = service.initialize(logId, query);
      const retrievedMemory = service.get(logId);

      expect(retrievedMemory).toEqual(initializedMemory);
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent logId', () => {
      const memory = service.get('non-existent-id');
      expect(memory).toBeUndefined();
    });

    it('should return existing memory', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const memory = service.get(logId);
      expect(memory).toBeDefined();
      expect(memory?.logId).toBe(logId);
    });
  });

  describe('updatePhase', () => {
    it('should update phase and step', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      service.updatePhase(logId, 'execution', 5);

      const memory = service.get(logId);
      expect(memory?.currentPhase).toBe('execution');
      expect(memory?.currentStep).toBe(5);
    });

    it('should handle non-existent logId gracefully', () => {
      expect(() => {
        service.updatePhase('non-existent', 'phase', 1);
      }).not.toThrow();
    });
  });

  describe('addSubGoal', () => {
    it('should add sub-goal and return ID', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const goalId = service.addSubGoal(logId, {
        description: 'Research quantum mechanics',
        status: 'pending',
        priority: 1,
        dependencies: [],
      });

      expect(goalId).toBeDefined();
      expect(typeof goalId).toBe('string');

      const memory = service.get(logId);
      expect(memory?.subGoals).toHaveLength(1);
      expect(memory?.subGoals[0].id).toBe(goalId);
      expect(memory?.subGoals[0].description).toBe(
        'Research quantum mechanics',
      );
    });

    it('should throw error for non-existent logId', () => {
      expect(() => {
        service.addSubGoal('non-existent', {
          description: 'test',
          status: 'pending',
          priority: 1,
          dependencies: [],
        });
      }).toThrow('No working memory for logId: non-existent');
    });
  });

  describe('updateSubGoalStatus', () => {
    it('should update sub-goal status', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const goalId = service.addSubGoal(logId, {
        description: 'Test goal',
        status: 'pending',
        priority: 1,
        dependencies: [],
      });

      service.updateSubGoalStatus(logId, goalId, 'completed');

      const memory = service.get(logId);
      const goal = memory?.subGoals.find((g) => g.id === goalId);
      expect(goal?.status).toBe('completed');
    });

    it('should handle non-existent logId gracefully', () => {
      expect(() => {
        service.updateSubGoalStatus('non-existent', 'goal-id', 'completed');
      }).not.toThrow();
    });

    it('should handle non-existent goalId gracefully', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      expect(() => {
        service.updateSubGoalStatus(logId, 'non-existent-goal', 'completed');
      }).not.toThrow();
    });
  });

  describe('addGatheredInfo', () => {
    it('should add gathered information and return ID', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const infoId = service.addGatheredInfo(logId, {
        content: 'Quantum computing uses qubits',
        source: 'wikipedia',
        relevance: 0.95,
      });

      expect(infoId).toBeDefined();
      expect(typeof infoId).toBe('string');

      const memory = service.get(logId);
      expect(memory?.gatheredInformation).toHaveLength(1);
      expect(memory?.gatheredInformation[0].id).toBe(infoId);
      expect(memory?.gatheredInformation[0].content).toBe(
        'Quantum computing uses qubits',
      );
      expect(memory?.gatheredInformation[0].addedAt).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent logId', () => {
      expect(() => {
        service.addGatheredInfo('non-existent', {
          content: 'test',
          source: 'test',
          relevance: 0.5,
        });
      }).toThrow('No working memory for logId: non-existent');
    });
  });

  describe('addHypothesis', () => {
    it('should add hypothesis and return ID', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const hypothesisId = service.addHypothesis(
        logId,
        'Quantum computers will revolutionize cryptography',
        0.8,
      );

      expect(hypothesisId).toBeDefined();
      expect(typeof hypothesisId).toBe('string');

      const memory = service.get(logId);
      expect(memory?.activeHypotheses).toHaveLength(1);
      expect(memory?.activeHypotheses[0].id).toBe(hypothesisId);
      expect(memory?.activeHypotheses[0].statement).toBe(
        'Quantum computers will revolutionize cryptography',
      );
      expect(memory?.activeHypotheses[0].confidence).toBe(0.8);
      expect(memory?.activeHypotheses[0].supportingEvidence).toEqual([]);
      expect(memory?.activeHypotheses[0].contradictingEvidence).toEqual([]);
    });

    it('should throw error for non-existent logId', () => {
      expect(() => {
        service.addHypothesis('non-existent', 'test hypothesis', 0.5);
      }).toThrow('No working memory for logId: non-existent');
    });
  });

  describe('updateHypothesisEvidence', () => {
    it('should add supporting evidence', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const hypothesisId = service.addHypothesis(logId, 'Test hypothesis', 0.7);
      service.updateHypothesisEvidence(
        logId,
        hypothesisId,
        'supporting',
        'Evidence 1',
      );

      const memory = service.get(logId);
      const hypothesis = memory?.activeHypotheses.find(
        (h) => h.id === hypothesisId,
      );
      expect(hypothesis?.supportingEvidence).toEqual(['Evidence 1']);
    });

    it('should add contradicting evidence', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const hypothesisId = service.addHypothesis(logId, 'Test hypothesis', 0.7);
      service.updateHypothesisEvidence(
        logId,
        hypothesisId,
        'contradicting',
        'Counter evidence',
      );

      const memory = service.get(logId);
      const hypothesis = memory?.activeHypotheses.find(
        (h) => h.id === hypothesisId,
      );
      expect(hypothesis?.contradictingEvidence).toEqual(['Counter evidence']);
    });

    it('should handle non-existent logId gracefully', () => {
      expect(() => {
        service.updateHypothesisEvidence(
          'non-existent',
          'hyp-id',
          'supporting',
          'evidence',
        );
      }).not.toThrow();
    });
  });

  describe('addGap', () => {
    it('should add gap and return ID', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const gapId = service.addGap(logId, {
        description: 'Missing information about quantum algorithms',
        severity: 'important',
        suggestedAction: 'Search for quantum algorithm papers',
      });

      expect(gapId).toBeDefined();
      expect(typeof gapId).toBe('string');

      const memory = service.get(logId);
      expect(memory?.identifiedGaps).toHaveLength(1);
      expect(memory?.identifiedGaps[0].id).toBe(gapId);
      expect(memory?.identifiedGaps[0].severity).toBe('important');
    });

    it('should throw error for non-existent logId', () => {
      expect(() => {
        service.addGap('non-existent', {
          description: 'test',
          severity: 'minor',
          suggestedAction: 'test',
        });
      }).toThrow('No working memory for logId: non-existent');
    });
  });

  describe('resolveGap', () => {
    it('should remove gap', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const gapId = service.addGap(logId, {
        description: 'Test gap',
        severity: 'minor',
        suggestedAction: 'Test action',
      });

      service.resolveGap(logId, gapId);

      const memory = service.get(logId);
      expect(memory?.identifiedGaps).toHaveLength(0);
    });

    it('should handle non-existent logId gracefully', () => {
      expect(() => {
        service.resolveGap('non-existent', 'gap-id');
      }).not.toThrow();
    });

    it('should handle non-existent gapId gracefully', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      expect(() => {
        service.resolveGap(logId, 'non-existent-gap');
      }).not.toThrow();

      const memory = service.get(logId);
      expect(memory?.identifiedGaps).toHaveLength(0);
    });
  });

  describe('scratchPad operations', () => {
    it('should set and get scratch pad values', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      service.setScratchPadValue(logId, 'testKey', { data: 'test value' });
      const value = service.getScratchPadValue<{ data: string }>(
        logId,
        'testKey',
      );

      expect(value).toEqual({ data: 'test value' });
    });

    it('should return undefined for non-existent key', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const value = service.getScratchPadValue(logId, 'non-existent-key');
      expect(value).toBeUndefined();
    });

    it('should handle non-existent logId gracefully for set', () => {
      expect(() => {
        service.setScratchPadValue('non-existent', 'key', 'value');
      }).not.toThrow();
    });

    it('should return undefined for non-existent logId for get', () => {
      const value = service.getScratchPadValue('non-existent', 'key');
      expect(value).toBeUndefined();
    });
  });

  describe('addThought', () => {
    it('should add thought to chain', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      service.addThought(logId, 'thought-1');
      service.addThought(logId, 'thought-2');

      const memory = service.get(logId);
      expect(memory?.thoughtChain).toEqual(['thought-1', 'thought-2']);
    });

    it('should handle non-existent logId gracefully', () => {
      expect(() => {
        service.addThought('non-existent', 'thought-id');
      }).not.toThrow();
    });
  });

  describe('getContext', () => {
    it('should generate readable summary', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'What is AI?');

      service.updatePhase(logId, 'research', 3);
      service.addSubGoal(logId, {
        description: 'Research AI history',
        status: 'completed',
        priority: 1,
        dependencies: [],
      });
      service.addGatheredInfo(logId, {
        content: 'AI was first coined in 1956',
        source: 'history.com',
        relevance: 0.9,
      });
      service.addHypothesis(logId, 'AI will transform industries', 0.85);
      service.addGap(logId, {
        description: 'Need more recent statistics',
        severity: 'important',
        suggestedAction: 'Search for 2024 AI reports',
      });

      const context = service.getContext(logId);

      expect(context).toContain('Current Phase: research (Step 3)');
      expect(context).toContain('Answer the query: "What is AI?"');
      expect(context).toContain('[completed] Research AI history');
      expect(context).toContain('AI was first coined in 1956');
      expect(context).toContain(
        'AI will transform industries (confidence: 85%)',
      );
      expect(context).toContain('[important] Need more recent statistics');
    });

    it('should return empty string for non-existent logId', () => {
      const context = service.getContext('non-existent');
      expect(context).toBe('');
    });

    it('should show "None" for empty sections', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      const context = service.getContext(logId);

      expect(context).toContain('Sub-goals:\n- None');
      expect(context).toContain('Gathered Information (0 items):\n- None yet');
      expect(context).toContain('Active Hypotheses:\n- None');
      expect(context).toContain('Identified Gaps:\n- None');
    });

    it('should only show recent 5 gathered information items', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      // Add 7 items
      for (let i = 1; i <= 7; i++) {
        service.addGatheredInfo(logId, {
          content: `Info ${i}`,
          source: 'test',
          relevance: 0.5,
        });
      }

      const context = service.getContext(logId);

      // Should show 7 total but only last 5 in detail
      expect(context).toContain('Gathered Information (7 items)');
      expect(context).toContain('Info 3');
      expect(context).toContain('Info 7');
      expect(context).not.toContain('Info 1');
      expect(context).not.toContain('Info 2');
    });

    it('should filter out minor gaps', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      service.addGap(logId, {
        description: 'Minor issue',
        severity: 'minor',
        suggestedAction: 'Optional',
      });
      service.addGap(logId, {
        description: 'Critical issue',
        severity: 'critical',
        suggestedAction: 'Immediate action',
      });

      const context = service.getContext(logId);

      expect(context).not.toContain('Minor issue');
      expect(context).toContain('Critical issue');
    });
  });

  describe('getStatistics', () => {
    it('should return statistics object', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      service.addSubGoal(logId, {
        description: 'Goal 1',
        status: 'completed',
        priority: 1,
        dependencies: [],
      });
      service.addSubGoal(logId, {
        description: 'Goal 2',
        status: 'pending',
        priority: 2,
        dependencies: [],
      });
      service.addGatheredInfo(logId, {
        content: 'Info',
        source: 'test',
        relevance: 0.5,
      });
      service.addHypothesis(logId, 'Hypothesis', 0.7);
      service.addGap(logId, {
        description: 'Gap',
        severity: 'critical',
        suggestedAction: 'Action',
      });
      service.addThought(logId, 'thought-1');

      const stats = service.getStatistics(logId);

      expect(stats).toEqual({
        subGoalsTotal: 2,
        subGoalsCompleted: 1,
        gatheredInfoCount: 1,
        hypothesesCount: 1,
        gapsCount: 1,
        criticalGaps: 1,
        thoughtChainLength: 1,
      });
    });

    it('should return undefined for non-existent logId', () => {
      const stats = service.getStatistics('non-existent');
      expect(stats).toBeUndefined();
    });

    it('should count critical gaps correctly', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      service.addGap(logId, {
        description: 'Gap 1',
        severity: 'critical',
        suggestedAction: 'Action',
      });
      service.addGap(logId, {
        description: 'Gap 2',
        severity: 'important',
        suggestedAction: 'Action',
      });
      service.addGap(logId, {
        description: 'Gap 3',
        severity: 'critical',
        suggestedAction: 'Action',
      });

      const stats = service.getStatistics(logId);

      expect(stats?.gapsCount).toBe(3);
      expect(stats?.criticalGaps).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should remove memory', () => {
      const logId = 'test-log-id';
      service.initialize(logId, 'test query');

      expect(service.get(logId)).toBeDefined();

      service.cleanup(logId);

      expect(service.get(logId)).toBeUndefined();
    });

    it('should handle non-existent logId gracefully', () => {
      expect(() => {
        service.cleanup('non-existent');
      }).not.toThrow();
    });
  });
});
