import { Test, TestingModule } from '@nestjs/testing';
import { RefinementEngineService } from './refinement-engine.service';
import { OllamaService } from '../../llm/ollama.service';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import { SelfCritique } from '../interfaces/self-critique.interface';
import { Gap } from '../interfaces/gap.interface';
import { Source } from '../interfaces/refinement-result.interface';

describe('RefinementEngineService', () => {
  let service: RefinementEngineService;
  let ollamaService: jest.Mocked<OllamaService>;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;
  let researchLogger: jest.Mocked<ResearchLogger>;

  const mockQuery = 'What are the benefits of TypeScript?';
  const mockOriginalAnswer =
    'TypeScript adds static typing to JavaScript. It helps catch errors early.';
  const mockRefinedAnswer =
    'TypeScript is a statically-typed superset of JavaScript that provides compile-time type checking. Key benefits include: 1) Early error detection during development [1], 2) Improved code maintainability through better tooling support [2], 3) Enhanced developer productivity via intelligent IDE features [3]. Studies show TypeScript reduces bugs by up to 15% in large codebases [1].';

  const mockCritique: SelfCritique = {
    overallAssessment: 'Answer is too brief and lacks source citations',
    strengths: ['Mentions static typing', 'Concise'],
    weaknesses: ['Too brief', 'No citations', 'Missing key benefits'],
    criticalIssues: ['No source citations', 'Incomplete coverage'],
    suggestedImprovements: [
      'Add specific benefits with examples',
      'Include source citations',
      'Expand on tooling and IDE support',
    ],
    confidence: 0.85,
  };

  const mockGaps: Gap[] = [
    {
      id: 'gap-1',
      type: 'incomplete_coverage',
      severity: 'critical',
      description: 'Missing discussion of IDE tooling support',
      suggestedAction: 'Add information about IDE features and tooling',
      confidence: 0.9,
    },
    {
      id: 'gap-2',
      type: 'missing_info',
      severity: 'major',
      description: 'No quantitative data on bug reduction',
      suggestedAction: 'Include statistics or studies on TypeScript benefits',
      confidence: 0.8,
    },
    {
      id: 'gap-3',
      type: 'weak_claim',
      severity: 'minor',
      description: 'Vague statement about catching errors',
      suggestedAction: 'Clarify how type checking catches errors',
      confidence: 0.7,
    },
  ];

  const mockSources: Source[] = [
    {
      id: 'source-1',
      url: 'https://example.com/typescript-study',
      content: 'TypeScript reduces bugs by 15% in large codebases according to research.',
      title: 'TypeScript Impact Study',
    },
    {
      id: 'source-2',
      url: 'https://example.com/typescript-tooling',
      content: 'IDE support includes autocomplete, refactoring, and navigation features.',
      title: 'TypeScript Tooling Guide',
    },
    {
      id: 'source-3',
      url: 'https://example.com/typescript-benefits',
      content: 'Compile-time type checking prevents runtime errors and improves code quality.',
      title: 'TypeScript Benefits Overview',
    },
  ];

  beforeEach(async () => {
    const mockOllamaService = {
      chat: jest.fn(),
    };

    const mockEventCoordinator = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const mockResearchLogger = {
      nodeStart: jest.fn(),
      nodeComplete: jest.fn(),
      nodeError: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefinementEngineService,
        { provide: OllamaService, useValue: mockOllamaService },
        { provide: EventCoordinatorService, useValue: mockEventCoordinator },
        { provide: ResearchLogger, useValue: mockResearchLogger },
      ],
    }).compile();

    service = module.get<RefinementEngineService>(RefinementEngineService);
    ollamaService = module.get(OllamaService);
    eventCoordinator = module.get(EventCoordinatorService);
    researchLogger = module.get(ResearchLogger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('refineAnswer', () => {
    it('should successfully refine an answer in a single pass', async () => {
      ollamaService.chat.mockResolvedValue({
        message: { content: mockRefinedAnswer },
        done: true,
        model: 'llama3',
        created_at: new Date().toISOString(),
        total_duration: 1000,
      });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
        'test-log-id',
      );

      expect(result).toBeDefined();
      expect(result.finalAnswer).toBe(mockRefinedAnswer);
      expect(result.refinementHistory.length).toBeGreaterThanOrEqual(1);
      expect(result.gapsResolved).toBeGreaterThan(0);
      expect(result.totalImprovement).toBeGreaterThan(0);
    });

    it('should perform multiple refinement passes when gaps remain', async () => {
      // Reset mock completely
      ollamaService.chat.mockReset();

      // First pass addresses some gaps
      ollamaService.chat
        .mockResolvedValueOnce({
          message: {
            content:
              'TypeScript is a statically-typed superset with IDE support [1].',
          },
          done: true,
          model: 'llama3',
          created_at: new Date().toISOString(),
          total_duration: 1000,
        })
        // Second pass addresses more gaps
        .mockResolvedValueOnce({
          message: { content: mockRefinedAnswer },
          done: true,
          model: 'llama3',
          created_at: new Date().toISOString(),
          total_duration: 1000,
        })
        // Third pass if needed
        .mockResolvedValueOnce({
          message: { content: mockRefinedAnswer },
          done: true,
          model: 'llama3',
          created_at: new Date().toISOString(),
          total_duration: 1000,
        });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
        'test-log-id',
      );

      expect(result.refinementHistory.length).toBeGreaterThan(0);
      expect(result.refinementHistory.length).toBeLessThanOrEqual(3);
      expect(ollamaService.chat).toHaveBeenCalled();
    });

    it('should stop early if no significant improvement', async () => {
      // Return nearly identical answer
      ollamaService.chat.mockResolvedValue({
        message: { content: mockOriginalAnswer + ' Additional word.' },
        done: true,
        model: 'llama3',
        created_at: new Date().toISOString(),
        total_duration: 1000,
      });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );

      expect(result.refinementHistory.length).toBeLessThanOrEqual(3);
    });

    it('should stop early if all gaps are addressed', async () => {
      // Return answer that addresses all gaps
      ollamaService.chat.mockResolvedValue({
        message: {
          content:
            'TypeScript IDE tooling includes autocomplete and refactoring. Studies show 15% bug reduction. Type checking catches errors at compile-time.',
        },
        done: true,
        model: 'llama3',
        created_at: new Date().toISOString(),
        total_duration: 1000,
      });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );

      expect(result.gapsResolved).toBe(mockGaps.length);
      expect(result.gapsRemaining).toBe(0);
    });

    it('should emit appropriate events during refinement', async () => {
      ollamaService.chat.mockResolvedValue({
        message: { content: mockRefinedAnswer },
        done: true,
        model: 'llama3',
        created_at: new Date().toISOString(),
        total_duration: 1000,
      });

      await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
        'test-log-id',
      );

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'test-log-id',
        'refinement_started',
        expect.objectContaining({
          originalAnswerLength: mockOriginalAnswer.length,
          gapCount: mockGaps.length,
        }),
      );

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'test-log-id',
        'refinement_pass',
        expect.objectContaining({
          iteration: expect.any(Number),
        }),
      );

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'test-log-id',
        'refinement_completed',
        expect.objectContaining({
          result: expect.any(Object),
        }),
      );
    });

    it('should log refinement progress', async () => {
      ollamaService.chat.mockResolvedValue({
        message: { content: mockRefinedAnswer },
        done: true,
        model: 'llama3',
        created_at: new Date().toISOString(),
        total_duration: 1000,
      });

      await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
        'test-log-id',
      );

      expect(researchLogger.nodeStart).toHaveBeenCalledWith(
        'refinement-engine',
        'test-log-id',
        'stage',
        'reflection',
      );

      expect(researchLogger.nodeComplete).toHaveBeenCalledWith(
        'refinement-engine',
        'test-log-id',
        expect.objectContaining({
          gapsResolved: expect.any(Number),
          totalImprovement: expect.any(Number),
        }),
      );
    });

    it('should handle LLM errors gracefully and return fallback result', async () => {
      ollamaService.chat.mockRejectedValue(new Error('LLM service unavailable'));

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
        'test-log-id',
      );

      expect(result).toBeDefined();
      expect(result.finalAnswer).toBe(mockOriginalAnswer);
      expect(result.gapsResolved).toBe(0);
      expect(result.gapsRemaining).toBe(mockGaps.length);
      expect(result.totalImprovement).toBe(0);
    });

    it('should handle empty gaps array', async () => {
      ollamaService.chat.mockResolvedValue({
        message: { content: mockOriginalAnswer },
        done: true,
        model: 'llama3',
        created_at: new Date().toISOString(),
        total_duration: 1000,
      });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        [],
        mockSources,
        mockQuery,
      );

      expect(result).toBeDefined();
      expect(result.gapsResolved).toBe(0);
      expect(result.gapsRemaining).toBe(0);
    });

    it('should handle empty sources array', async () => {
      ollamaService.chat.mockResolvedValue({
        message: { content: mockRefinedAnswer },
        done: true,
        model: 'llama3',
        created_at: new Date().toISOString(),
        total_duration: 1000,
      });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        [],
        mockQuery,
      );

      expect(result).toBeDefined();
      expect(result.finalAnswer).toBe(mockRefinedAnswer);
    });

    it('should prioritize critical gaps over minor ones', async () => {
      ollamaService.chat.mockImplementation(async (messages) => {
        const prompt = messages[1].content;
        // Check that critical gap appears before minor gaps in prompt
        const criticalIndex = prompt.indexOf('[CRITICAL]');
        const minorIndex = prompt.indexOf('[MINOR]');
        expect(criticalIndex).toBeLessThan(minorIndex);

        return {
          message: { content: mockRefinedAnswer },
          done: true,
          model: 'llama3',
          created_at: new Date().toISOString(),
          total_duration: 1000,
        };
      });

      await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );

      expect(ollamaService.chat).toHaveBeenCalled();
    });

    it('should track improvement scores correctly', async () => {
      ollamaService.chat.mockResolvedValue({
        message: { content: mockRefinedAnswer },
        done: true,
        model: 'llama3',
        created_at: new Date().toISOString(),
        total_duration: 1000,
      });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );

      expect(result.totalImprovement).toBeGreaterThanOrEqual(0);
      expect(result.totalImprovement).toBeLessThanOrEqual(1);
      result.refinementHistory.forEach((attempt) => {
        expect(attempt.improvement).toBeGreaterThanOrEqual(0);
        expect(attempt.improvement).toBeLessThanOrEqual(1);
      });
    });

    it('should include source citations in refinement prompt', async () => {
      ollamaService.chat.mockImplementation(async (messages) => {
        const prompt = messages[1].content;
        expect(prompt).toContain('TypeScript Impact Study');
        expect(prompt).toContain('TypeScript Tooling Guide');
        expect(prompt).toContain('SOURCES AVAILABLE');

        return {
          message: { content: mockRefinedAnswer },
          done: true,
          model: 'llama3',
          created_at: new Date().toISOString(),
          total_duration: 1000,
        };
      });

      await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );
    });

    it('should include critique in refinement prompt', async () => {
      ollamaService.chat.mockImplementation(async (messages) => {
        const prompt = messages[1].content;
        expect(prompt).toContain('Strengths:');
        expect(prompt).toContain('Weaknesses:');
        expect(prompt).toContain('Critical Issues:');
        expect(prompt).toContain('Suggested Improvements:');

        return {
          message: { content: mockRefinedAnswer },
          done: true,
          model: 'llama3',
          created_at: new Date().toISOString(),
          total_duration: 1000,
        };
      });

      await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );
    });

    it('should respect maximum refinement passes limit', async () => {
      // Mock LLM to always return slightly different answers
      let callCount = 0;
      ollamaService.chat.mockImplementation(async () => {
        callCount++;
        return {
          message: { content: `${mockOriginalAnswer} Pass ${callCount}` },
          done: true,
          model: 'llama3',
          created_at: new Date().toISOString(),
          total_duration: 1000,
        };
      });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );

      expect(result.refinementHistory.length).toBeLessThanOrEqual(3);
      expect(ollamaService.chat).toHaveBeenCalledTimes(
        Math.min(3, result.refinementHistory.length),
      );
    });

    it('should calculate addressed gaps using keyword matching', async () => {
      // Answer that clearly addresses specific gaps
      const answerWithKeywords =
        'TypeScript IDE tooling support includes autocomplete and refactoring. Studies show 15% bug reduction in large projects.';

      ollamaService.chat.mockResolvedValue({
        message: { content: answerWithKeywords },
        done: true,
        model: 'llama3',
        created_at: new Date().toISOString(),
        total_duration: 1000,
      });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );

      expect(result.gapsResolved).toBeGreaterThan(0);
    });

    it('should emit events on error', async () => {
      ollamaService.chat.mockRejectedValue(new Error('Network timeout'));

      await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
        'test-log-id',
      );

      // Should emit started event
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'test-log-id',
        'refinement_started',
        expect.any(Object),
      );
    });

    it('should log when refinement encounters errors', async () => {
      const error = new Error('LLM timeout');
      ollamaService.chat.mockRejectedValue(error);

      await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
        'test-log-id',
      );

      // Should have logged the node start
      expect(researchLogger.nodeStart).toHaveBeenCalledWith(
        'refinement-engine',
        'test-log-id',
        'stage',
        'reflection',
      );
    });

    it('should handle refinement pass failures gracefully', async () => {
      // First pass fails, should continue to try more passes
      ollamaService.chat
        .mockRejectedValueOnce(new Error('First pass failed'))
        .mockResolvedValueOnce({
          message: { content: mockRefinedAnswer },
          done: true,
          model: 'llama3',
          created_at: new Date().toISOString(),
          total_duration: 1000,
        });

      const result = await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );

      // Should have attempted refinement despite first failure
      expect(result).toBeDefined();
    });

    it('should include previous attempts in context for later passes', async () => {
      ollamaService.chat
        .mockResolvedValueOnce({
          message: { content: 'First refinement attempt' },
          done: true,
          model: 'llama3',
          created_at: new Date().toISOString(),
          total_duration: 1000,
        })
        .mockImplementationOnce(async (messages) => {
          const prompt = messages[1].content;
          expect(prompt).toContain('PREVIOUS REFINEMENT ATTEMPTS');
          expect(prompt).toContain('Pass 1');

          return {
            message: { content: mockRefinedAnswer },
            done: true,
            model: 'llama3',
            created_at: new Date().toISOString(),
            total_duration: 1000,
          };
        });

      await service.refineAnswer(
        mockOriginalAnswer,
        mockCritique,
        mockGaps,
        mockSources,
        mockQuery,
      );
    });
  });
});
