import { Test, TestingModule } from '@nestjs/testing';
import { CoverageAnalyzerService } from './coverage-analyzer.service';
import { LLMService } from '../../llm/llm.service';
import { EventCoordinatorService } from './event-coordinator.service';
import { Source } from './result-extractor.service';
import { SubQuery } from '../interfaces/sub-query.interface';
import { QueryAspect } from '../interfaces/query-aspect.interface';

describe('CoverageAnalyzerService', () => {
  let service: CoverageAnalyzerService;
  let ollamaService: jest.Mocked<LLMService>;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;

  beforeEach(async () => {
    const mockLLMService = {
      chat: jest.fn(),
    };

    const mockEventCoordinator = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoverageAnalyzerService,
        { provide: LLMService, useValue: mockLLMService },
        { provide: EventCoordinatorService, useValue: mockEventCoordinator },
      ],
    }).compile();

    service = module.get<CoverageAnalyzerService>(CoverageAnalyzerService);
    ollamaService = module.get(LLMService);
    eventCoordinator = module.get(EventCoordinatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeCoverage', () => {
    it('should analyze coverage for a simple query with single aspect', async () => {
      const query = 'What is the capital of France?';
      const answer = 'The capital of France is Paris.';
      const sources: Source[] = [
        { url: 'https://example.com/france', title: 'France Facts', relevance: 'high' },
      ];

      const llmResponse = {
        message: {
          role: 'assistant',
          content: JSON.stringify({
            aspects: [
              {
                id: 'aspect-1',
                description: 'Capital city of France',
                keywords: ['capital', 'France', 'Paris'],
                answered: true,
                confidence: 0.95,
                supportingSources: ['France Facts'],
              },
            ],
            suggestedRetrievals: [],
          }),
        },
      };

      ollamaService.chat.mockResolvedValue(llmResponse as any);

      const result = await service.analyzeCoverage(query, answer, sources, undefined, 'test-log-1');

      expect(result.overallCoverage).toBe(0.95);
      expect(result.aspectsCovered).toHaveLength(1);
      expect(result.aspectsMissing).toHaveLength(0);
      expect(result.isComplete).toBe(true);
      expect(result.suggestedRetrievals).toHaveLength(0);

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'test-log-1',
        'coverage_analysis_started',
        expect.objectContaining({
          query,
          answerLength: answer.length,
        }),
      );

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'test-log-1',
        'coverage_analysis_completed',
        expect.objectContaining({
          overallCoverage: 0.95,
          aspectsCoveredCount: 1,
          aspectsMissingCount: 0,
          isComplete: true,
        }),
      );
    });

    it('should analyze coverage for a complex query with multiple aspects', async () => {
      const query = 'What are the causes and effects of climate change?';
      const answer = 'Climate change is primarily caused by greenhouse gas emissions.';
      const sources: Source[] = [
        { url: 'https://example.com/climate', title: 'Climate Science', relevance: 'high' },
      ];

      const llmResponse = {
        message: {
          role: 'assistant',
          content: JSON.stringify({
            aspects: [
              {
                id: 'aspect-1',
                description: 'Causes of climate change',
                keywords: ['causes', 'greenhouse', 'emissions'],
                answered: true,
                confidence: 0.8,
                supportingSources: ['Climate Science'],
              },
              {
                id: 'aspect-2',
                description: 'Effects of climate change',
                keywords: ['effects', 'impacts', 'consequences'],
                answered: false,
                confidence: 0.0,
                supportingSources: [],
              },
            ],
            suggestedRetrievals: [
              {
                aspect: 'Effects of climate change',
                searchQuery: 'climate change effects impacts consequences',
                priority: 'high',
                reasoning: 'Effects aspect not covered in current answer',
              },
            ],
          }),
        },
      };

      ollamaService.chat.mockResolvedValue(llmResponse as any);

      const result = await service.analyzeCoverage(query, answer, sources, undefined, 'test-log-2');

      expect(result.overallCoverage).toBe(0.4); // (0.8 + 0) / 2
      expect(result.aspectsCovered).toHaveLength(1);
      expect(result.aspectsMissing).toHaveLength(1);
      expect(result.isComplete).toBe(false);
      expect(result.suggestedRetrievals).toHaveLength(1);
      expect(result.suggestedRetrievals[0].priority).toBe('high');
    });

    it('should handle mixed answered/unanswered aspects with varying confidence', async () => {
      const query = 'Explain the history, architecture, and current status of the Eiffel Tower';
      const answer = 'The Eiffel Tower was built in 1889. It has a unique iron lattice design.';
      const sources: Source[] = [
        { url: 'https://example.com/eiffel', title: 'Eiffel Tower History', relevance: 'high' },
      ];

      const llmResponse = {
        message: {
          role: 'assistant',
          content: JSON.stringify({
            aspects: [
              {
                id: 'aspect-1',
                description: 'History of the Eiffel Tower',
                keywords: ['history', '1889', 'built'],
                answered: true,
                confidence: 0.9,
                supportingSources: ['Eiffel Tower History'],
              },
              {
                id: 'aspect-2',
                description: 'Architecture of the Eiffel Tower',
                keywords: ['architecture', 'design', 'iron'],
                answered: true,
                confidence: 0.65,
                supportingSources: ['Eiffel Tower History'],
              },
              {
                id: 'aspect-3',
                description: 'Current status of the Eiffel Tower',
                keywords: ['current', 'status', 'today'],
                answered: false,
                confidence: 0.0,
                supportingSources: [],
              },
            ],
            suggestedRetrievals: [
              {
                aspect: 'Architecture of the Eiffel Tower',
                searchQuery: 'Eiffel Tower architecture design structure',
                priority: 'medium',
                reasoning: 'Architecture aspect has low confidence (0.65)',
              },
              {
                aspect: 'Current status of the Eiffel Tower',
                searchQuery: 'Eiffel Tower current status today',
                priority: 'high',
                reasoning: 'Current status aspect not addressed',
              },
            ],
          }),
        },
      };

      ollamaService.chat.mockResolvedValue(llmResponse as any);

      const result = await service.analyzeCoverage(query, answer, sources);

      // Overall coverage: (0.9 + 0.65 + 0) / 3 = 0.516
      expect(result.overallCoverage).toBeCloseTo(0.516, 2);
      expect(result.aspectsCovered).toHaveLength(1); // Only aspect with confidence >= 0.7
      expect(result.aspectsMissing).toHaveLength(2); // One unanswered, one low confidence
      expect(result.isComplete).toBe(false);
      expect(result.suggestedRetrievals).toHaveLength(2);
    });

    it('should work with decomposed sub-queries', async () => {
      const query = 'What is quantum computing and how does it work?';
      const answer = 'Quantum computing uses quantum bits or qubits.';
      const sources: Source[] = [
        { url: 'https://example.com/quantum', title: 'Quantum Computing 101', relevance: 'high' },
      ];

      const subQueries: SubQuery[] = [
        {
          id: 'sq-1',
          text: 'What is quantum computing?',
          order: 1,
          dependencies: [],
          type: 'factual',
          priority: 'high',
          estimatedComplexity: 2,
        },
        {
          id: 'sq-2',
          text: 'How does quantum computing work?',
          order: 2,
          dependencies: ['sq-1'],
          type: 'analytical',
          priority: 'high',
          estimatedComplexity: 4,
        },
      ];

      const llmResponse = {
        message: {
          role: 'assistant',
          content: JSON.stringify({
            aspects: [
              {
                id: 'aspect-1',
                description: 'Definition of quantum computing',
                keywords: ['quantum', 'computing', 'qubits'],
                answered: true,
                confidence: 0.75,
                supportingSources: ['Quantum Computing 101'],
              },
              {
                id: 'aspect-2',
                description: 'How quantum computing works',
                keywords: ['how', 'works', 'mechanism'],
                answered: true,
                confidence: 0.3,
                supportingSources: [],
              },
            ],
            suggestedRetrievals: [
              {
                aspect: 'How quantum computing works',
                searchQuery: 'quantum computing mechanism how it works',
                priority: 'high',
                reasoning: 'Mechanism not adequately explained',
              },
            ],
          }),
        },
      };

      ollamaService.chat.mockResolvedValue(llmResponse as any);

      const result = await service.analyzeCoverage(query, answer, sources, subQueries);

      expect(result.overallCoverage).toBeCloseTo(0.525, 2); // (0.75 + 0.3) / 2
      expect(result.aspectsCovered).toHaveLength(1); // Only aspect with confidence >= 0.7
      expect(result.aspectsMissing).toHaveLength(1); // Aspect with confidence 0.3 < 0.7
      expect(result.isComplete).toBe(false);
    });

    it('should handle LLM response with markdown code blocks', async () => {
      const query = 'Test query';
      const answer = 'Test answer';
      const sources: Source[] = [];

      const llmResponse = {
        message: {
          role: 'assistant',
          content: '```json\n' + JSON.stringify({
            aspects: [
              {
                id: 'aspect-1',
                description: 'Test aspect',
                keywords: ['test'],
                answered: true,
                confidence: 0.9,
                supportingSources: [],
              },
            ],
            suggestedRetrievals: [],
          }) + '\n```',
        },
      };

      ollamaService.chat.mockResolvedValue(llmResponse as any);

      const result = await service.analyzeCoverage(query, answer, sources);

      expect(result.aspectsCovered).toHaveLength(1);
      expect(result.aspectsCovered[0].description).toBe('Test aspect');
    });

    it('should handle parsing errors gracefully', async () => {
      const query = 'Test query';
      const answer = 'Test answer';
      const sources: Source[] = [];

      const llmResponse = {
        message: {
          role: 'assistant',
          content: 'Invalid JSON response',
        },
      };

      ollamaService.chat.mockResolvedValue(llmResponse as any);

      const result = await service.analyzeCoverage(query, answer, sources);

      // Should return empty structure on parse error
      expect(result.overallCoverage).toBe(1.0); // No aspects = 100% coverage
      expect(result.aspectsCovered).toHaveLength(0);
      expect(result.aspectsMissing).toHaveLength(0);
      expect(result.suggestedRetrievals).toHaveLength(0);
    });

    it('should emit error event when LLM call fails', async () => {
      const query = 'Test query';
      const answer = 'Test answer';
      const sources: Source[] = [];

      ollamaService.chat.mockRejectedValue(new Error('LLM service unavailable'));

      await expect(
        service.analyzeCoverage(query, answer, sources, undefined, 'test-log-error'),
      ).rejects.toThrow('LLM service unavailable');

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'test-log-error',
        'coverage_analysis_completed',
        expect.objectContaining({
          error: 'LLM service unavailable',
          overallCoverage: 0,
          isComplete: false,
        }),
      );
    });
  });

  describe('suggestAdditionalRetrieval', () => {
    it('should return empty array when no missing aspects', async () => {
      const missingAspects: QueryAspect[] = [];

      const result = await service.suggestAdditionalRetrieval(missingAspects);

      expect(result).toHaveLength(0);
    });

    it('should generate high priority suggestions for unanswered aspects', async () => {
      const missingAspects: QueryAspect[] = [
        {
          id: 'aspect-1',
          description: 'Effects of climate change',
          keywords: ['effects', 'impacts'],
          answered: false,
          confidence: 0.0,
          supportingSources: [],
        },
      ];

      const result = await service.suggestAdditionalRetrieval(missingAspects);

      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('high');
      expect(result[0].searchQuery).toBe('effects impacts');
      expect(result[0].aspect).toBe('Effects of climate change');
    });

    it('should generate medium priority suggestions for low confidence aspects', async () => {
      const missingAspects: QueryAspect[] = [
        {
          id: 'aspect-1',
          description: 'Architecture details',
          keywords: ['architecture', 'design'],
          answered: true,
          confidence: 0.5,
          supportingSources: ['source1'],
        },
      ];

      const result = await service.suggestAdditionalRetrieval(missingAspects);

      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('medium');
    });

    it('should generate low priority suggestions for borderline confidence aspects', async () => {
      const missingAspects: QueryAspect[] = [
        {
          id: 'aspect-1',
          description: 'Historical context',
          keywords: ['history', 'background'],
          answered: true,
          confidence: 0.75,
          supportingSources: ['source1'],
        },
      ];

      const result = await service.suggestAdditionalRetrieval(missingAspects);

      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('low');
    });

    it('should sort suggestions by priority', async () => {
      const missingAspects: QueryAspect[] = [
        {
          id: 'aspect-1',
          description: 'Low priority aspect',
          keywords: ['low'],
          answered: true,
          confidence: 0.75,
          supportingSources: ['source1'],
        },
        {
          id: 'aspect-2',
          description: 'High priority aspect',
          keywords: ['high'],
          answered: false,
          confidence: 0.0,
          supportingSources: [],
        },
        {
          id: 'aspect-3',
          description: 'Medium priority aspect',
          keywords: ['medium'],
          answered: true,
          confidence: 0.5,
          supportingSources: ['source2'],
        },
      ];

      const result = await service.suggestAdditionalRetrieval(missingAspects);

      expect(result).toHaveLength(3);
      expect(result[0].priority).toBe('high');
      expect(result[1].priority).toBe('medium');
      expect(result[2].priority).toBe('low');
    });

    it('should use description for search query when no keywords available', async () => {
      const missingAspects: QueryAspect[] = [
        {
          id: 'aspect-1',
          description: 'What are the long-term effects of the policy',
          keywords: [],
          answered: false,
          confidence: 0.0,
          supportingSources: [],
        },
      ];

      const result = await service.suggestAdditionalRetrieval(missingAspects);

      expect(result).toHaveLength(1);
      expect(result[0].searchQuery).toBe('What are the long-term effects of');
    });
  });
});
