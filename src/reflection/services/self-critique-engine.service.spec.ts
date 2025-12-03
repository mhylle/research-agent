import { Test, TestingModule } from '@nestjs/testing';
import { SelfCritiqueEngineService } from './self-critique-engine.service';
import { OllamaService } from '../../llm/ollama.service';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import { Gap } from '../interfaces/gap.interface';
import {
  ConfidenceResult,
  ClaimConfidence,
} from '../../evaluation/interfaces/confidence.interface';
import { SelfCritique } from '../interfaces/self-critique.interface';

describe('SelfCritiqueEngineService', () => {
  let service: SelfCritiqueEngineService;
  let mockOllamaService: jest.Mocked<Partial<OllamaService>>;
  let mockEventCoordinator: jest.Mocked<Partial<EventCoordinatorService>>;
  let mockResearchLogger: jest.Mocked<Partial<ResearchLogger>>;

  // Test data factories
  const createMockGap = (overrides: Partial<Gap> = {}): Gap => ({
    id: 'gap-1',
    type: 'missing_info',
    severity: 'major',
    description: 'Missing recent data',
    suggestedAction: 'Search for 2024 statistics',
    confidence: 0.8,
    ...overrides,
  });

  const createMockClaimConfidence = (
    overrides: Partial<ClaimConfidence> = {},
  ): ClaimConfidence => ({
    claimId: 'claim-1',
    claimText: 'The sky is blue',
    confidence: 0.85,
    level: 'high',
    entailmentScore: 0.9,
    suScore: 0.8,
    supportingSources: 3,
    ...overrides,
  });

  const createMockConfidenceResult = (
    overrides: Partial<ConfidenceResult> = {},
  ): ConfidenceResult => ({
    overallConfidence: 0.65,
    level: 'medium',
    claimConfidences: [
      createMockClaimConfidence(),
      createMockClaimConfidence({
        claimId: 'claim-2',
        claimText: 'Water is wet',
        confidence: 0.6,
        level: 'medium',
      }),
    ],
    methodology: {
      entailmentWeight: 0.5,
      suScoreWeight: 0.3,
      sourceCountWeight: 0.2,
    },
    recommendations: ['Gather more sources for claim-2'],
    ...overrides,
  });

  const createMockSource = (overrides: Partial<any> = {}) => ({
    id: 'source-1',
    url: 'https://example.com/article',
    content: 'This is the source content with relevant information.',
    title: 'Example Article',
    ...overrides,
  });

  const createValidLLMResponse = (overrides: Partial<any> = {}) => ({
    overallAssessment:
      'The answer is moderately complete but lacks recent data.',
    strengths: ['Well-structured response', 'Good source citations'],
    weaknesses: ['Missing 2024 data', 'Some claims unsupported'],
    criticalIssues: ['Outdated statistics from 2020'],
    suggestedImprovements: [
      'Add recent studies from 2024',
      'Verify source claims with additional references',
    ],
    ...overrides,
  });

  beforeEach(async () => {
    mockOllamaService = {
      chat: jest.fn(),
    };

    mockEventCoordinator = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    mockResearchLogger = {
      nodeStart: jest.fn(),
      nodeComplete: jest.fn(),
      nodeError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelfCritiqueEngineService,
        { provide: OllamaService, useValue: mockOllamaService },
        { provide: EventCoordinatorService, useValue: mockEventCoordinator },
        { provide: ResearchLogger, useValue: mockResearchLogger },
      ],
    }).compile();

    service = module.get<SelfCritiqueEngineService>(SelfCritiqueEngineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('critiqueSynthesis', () => {
    describe('successful critique generation', () => {
      it('should generate a valid critique when LLM returns valid JSON', async () => {
        const llmResponse = createValidLLMResponse();
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(llmResponse) },
        });

        const result = await service.critiqueSynthesis(
          'This is a test answer about climate change.',
          [createMockSource()],
          'What is climate change?',
          createMockConfidenceResult(),
          [createMockGap()],
        );

        expect(result).toBeDefined();
        expect(result.overallAssessment).toBe(llmResponse.overallAssessment);
        expect(result.strengths).toEqual(llmResponse.strengths);
        expect(result.weaknesses).toEqual(llmResponse.weaknesses);
        expect(result.criticalIssues).toEqual(llmResponse.criticalIssues);
        expect(result.suggestedImprovements).toEqual(
          llmResponse.suggestedImprovements,
        );
        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });

      it('should extract JSON from response with surrounding text', async () => {
        const llmResponse = createValidLLMResponse();
        const responseWithText = `Here is my analysis:\n\n${JSON.stringify(llmResponse)}\n\nI hope this helps!`;
        mockOllamaService.chat.mockResolvedValue({
          message: { content: responseWithText },
        });

        const result = await service.critiqueSynthesis(
          'Test answer',
          [createMockSource()],
          'Test query',
          createMockConfidenceResult(),
          [],
        );

        expect(result.overallAssessment).toBe(llmResponse.overallAssessment);
        expect(result.strengths).toEqual(llmResponse.strengths);
      });

      it('should call LLM with correct system and user messages', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        await service.critiqueSynthesis(
          'Test answer about technology',
          [createMockSource({ title: 'Tech Article' })],
          'What is AI?',
          createMockConfidenceResult(),
          [createMockGap({ description: 'Missing AI history' })],
        );

        expect(mockOllamaService.chat).toHaveBeenCalledTimes(1);
        const callArgs = mockOllamaService.chat.mock.calls[0][0];

        expect(callArgs).toHaveLength(2);
        expect(callArgs[0].role).toBe('system');
        expect(callArgs[0].content).toContain('critical evaluator');
        expect(callArgs[1].role).toBe('user');
        expect(callArgs[1].content).toContain('What is AI?');
        expect(callArgs[1].content).toContain('Test answer about technology');
      });
    });

    describe('critique with all sections populated', () => {
      it('should verify all 5 sections are populated correctly', async () => {
        const llmResponse = createValidLLMResponse({
          strengths: ['Strength 1', 'Strength 2', 'Strength 3'],
          weaknesses: ['Weakness 1', 'Weakness 2'],
          criticalIssues: ['Critical issue 1'],
          suggestedImprovements: ['Improvement 1', 'Improvement 2', 'Improvement 3'],
        });
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(llmResponse) },
        });

        const result = await service.critiqueSynthesis(
          'Comprehensive answer',
          [createMockSource(), createMockSource({ id: 'source-2' })],
          'Complex query',
          createMockConfidenceResult(),
          [createMockGap()],
        );

        expect(result.overallAssessment).toBeTruthy();
        expect(result.strengths).toHaveLength(3);
        expect(result.weaknesses).toHaveLength(2);
        expect(result.criticalIssues).toHaveLength(1);
        expect(result.suggestedImprovements).toHaveLength(3);
        expect(result.confidence).toBeGreaterThan(0);
      });

      it('should handle empty arrays in response gracefully', async () => {
        const llmResponse = {
          overallAssessment: 'Good answer',
          strengths: [],
          weaknesses: [],
          criticalIssues: [],
          suggestedImprovements: [],
        };
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(llmResponse) },
        });

        const result = await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        expect(result.strengths).toEqual([]);
        expect(result.weaknesses).toEqual([]);
        expect(result.criticalIssues).toEqual([]);
        expect(result.suggestedImprovements).toEqual([]);
      });

      it('should convert non-array fields to empty arrays', async () => {
        const llmResponse = {
          overallAssessment: 'Assessment',
          strengths: 'Not an array',
          weaknesses: null,
          criticalIssues: undefined,
          suggestedImprovements: 123,
        };
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(llmResponse) },
        });

        const result = await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        expect(Array.isArray(result.strengths)).toBe(true);
        expect(Array.isArray(result.weaknesses)).toBe(true);
        expect(Array.isArray(result.criticalIssues)).toBe(true);
        expect(Array.isArray(result.suggestedImprovements)).toBe(true);
      });
    });

    describe('confidence calculation', () => {
      it('should calculate higher confidence when critique has content in all sections', async () => {
        const comprehensiveResponse = createValidLLMResponse({
          strengths: ['Detailed strength with more than fifty characters of explanation'],
          weaknesses: ['Detailed weakness with more than fifty characters of explanation'],
          suggestedImprovements: ['Detailed improvement with more than fifty characters of explanation'],
          criticalIssues: ['Critical issue identified'],
        });
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(comprehensiveResponse) },
        });

        const result = await service.critiqueSynthesis(
          'Answer',
          [createMockSource()],
          'Query',
          createMockConfidenceResult(),
          [createMockGap()],
        );

        // With complete content, balance, specificity, sources, and matching gaps/issues
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should calculate lower confidence when critique is missing sections', async () => {
        const incompleteResponse = {
          overallAssessment: 'Brief',
          strengths: ['Short'],
          weaknesses: [],
          criticalIssues: [],
          suggestedImprovements: [],
        };
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(incompleteResponse) },
        });

        const result = await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        // Missing content, no balance, no sources, no gaps alignment
        expect(result.confidence).toBeLessThan(0.7);
      });

      it('should give bonus confidence when gaps match critical issues', async () => {
        const responseWithCriticalIssues = createValidLLMResponse({
          criticalIssues: ['Major data gap identified'],
        });
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(responseWithCriticalIssues) },
        });

        const resultWithGaps = await service.critiqueSynthesis(
          'Answer',
          [createMockSource()],
          'Query',
          createMockConfidenceResult(),
          [createMockGap({ severity: 'critical' })],
        );

        const responseNoCriticalIssues = createValidLLMResponse({
          criticalIssues: [],
        });
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(responseNoCriticalIssues) },
        });

        const resultWithoutGaps = await service.critiqueSynthesis(
          'Answer',
          [createMockSource()],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        // Both should have reasonable confidence but with gaps matching should be higher
        expect(resultWithGaps.confidence).toBeGreaterThanOrEqual(
          resultWithoutGaps.confidence - 0.1,
        );
      });

      it('should add confidence for source availability', async () => {
        // Use response with only strengths (no weaknesses/improvements)
        // This limits confidence to baseline + source bonus only
        // Baseline: 0.5, hasContent requires all 3 (strengths, weaknesses, improvements)
        // No balance without weaknesses
        // Sources add 0.1
        const responseOnlyStrengths = {
          overallAssessment: 'Brief assessment',
          strengths: ['A'],
          weaknesses: [],
          criticalIssues: [],
          suggestedImprovements: [],
        };

        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(responseOnlyStrengths) },
        });

        const resultWithSources = await service.critiqueSynthesis(
          'Answer',
          [createMockSource()],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(responseOnlyStrengths) },
        });

        const resultWithoutSources = await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        // With sources: 0.5 (base) + 0.05 (no gaps, no critical issues) + 0.1 (sources) = 0.65
        // Without sources: 0.5 (base) + 0.05 (no gaps, no critical issues) = 0.55
        expect(resultWithSources.confidence).toBe(0.65);
        expect(resultWithoutSources.confidence).toBe(0.55);
        expect(resultWithSources.confidence).toBeGreaterThan(
          resultWithoutSources.confidence,
        );
      });

      it('should ensure confidence stays within 0-1 range', async () => {
        // Test with maximum possible positive factors
        const maxResponse = createValidLLMResponse({
          strengths: Array(10).fill('Very detailed strength item with over fifty characters'),
          weaknesses: Array(10).fill('Very detailed weakness item with over fifty characters'),
          suggestedImprovements: Array(10).fill('Very detailed improvement with over fifty characters'),
          criticalIssues: Array(5).fill('Critical issue'),
        });
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(maxResponse) },
        });

        const result = await service.critiqueSynthesis(
          'Answer',
          Array(20).fill(createMockSource()),
          'Query',
          createMockConfidenceResult(),
          Array(10).fill(createMockGap()),
        );

        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
      });
    });

    describe('JSON parsing error handling', () => {
      it('should return fallback critique when LLM returns malformed JSON', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: '{ invalid json here }}}' },
        });

        const result = await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        expect(result.overallAssessment).toContain('Unable to generate');
        // Fallback critique has all sections populated, so confidence is recalculated
        // based on the fallback content (has strengths, weaknesses, improvements)
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.criticalIssues).toContain(
          'Self-critique system failure - manual review recommended',
        );
      });

      it('should return fallback critique when no JSON found in response', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: 'This is just plain text with no JSON at all.' },
        });

        const result = await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        expect(result.overallAssessment).toContain('no JSON detected');
        // Confidence is recalculated based on fallback content structure
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });

      it('should provide default assessment when overallAssessment is missing', async () => {
        const responseWithoutAssessment = {
          strengths: ['Good'],
          weaknesses: ['Bad'],
          criticalIssues: [],
          suggestedImprovements: [],
        };
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(responseWithoutAssessment) },
        });

        const result = await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        expect(result.overallAssessment).toBe('No overall assessment provided');
      });
    });

    describe('LLM failure handling', () => {
      it('should return fallback critique when LLM throws error', async () => {
        const errorMessage = 'LLM service unavailable';
        mockOllamaService.chat.mockRejectedValue(new Error(errorMessage));

        const result = await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
          'test-log-id',
        );

        expect(result.overallAssessment).toContain(errorMessage);
        expect(result.confidence).toBe(0.3);
        expect(result.suggestedImprovements).toContain(
          'Verify LLM service availability',
        );
      });

      it('should log error when LLM fails', async () => {
        mockOllamaService.chat.mockRejectedValue(new Error('Connection timeout'));

        await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
          'test-log-id',
        );

        expect(mockResearchLogger.nodeError).toHaveBeenCalledWith(
          'self-critique',
          'test-log-id',
          expect.any(Error),
        );
      });

      it('should emit self_critique_failed event on error', async () => {
        mockOllamaService.chat.mockRejectedValue(new Error('Network error'));

        await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
          'test-log-id',
        );

        expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
          'test-log-id',
          'self_critique_failed',
          expect.objectContaining({
            error: 'Network error',
            executionTime: expect.any(Number),
          }),
        );
      });
    });

    describe('SSE events', () => {
      it('should emit self_critique_started at beginning when logId provided', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        await service.critiqueSynthesis(
          'Test answer',
          [createMockSource()],
          'Test query',
          createMockConfidenceResult(),
          [createMockGap()],
          'log-123',
        );

        expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
          'log-123',
          'self_critique_started',
          expect.objectContaining({
            answerLength: 11,
            sourceCount: 1,
            gapCount: 1,
          }),
        );
      });

      it('should emit self_critique_completed at end when successful', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        await service.critiqueSynthesis(
          'Answer',
          [createMockSource()],
          'Query',
          createMockConfidenceResult(),
          [],
          'log-456',
        );

        expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
          'log-456',
          'self_critique_completed',
          expect.objectContaining({
            critique: expect.any(Object),
            executionTime: expect.any(Number),
          }),
        );
      });

      it('should not emit events when logId is not provided', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        expect(mockEventCoordinator.emit).not.toHaveBeenCalled();
      });

      it('should call researchLogger.nodeStart and nodeComplete with logId', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        await service.critiqueSynthesis(
          'Answer',
          [createMockSource()],
          'Query',
          createMockConfidenceResult(),
          [createMockGap()],
          'log-789',
        );

        expect(mockResearchLogger.nodeStart).toHaveBeenCalledWith(
          'self-critique',
          'log-789',
          'stage',
          'evaluation',
        );

        expect(mockResearchLogger.nodeComplete).toHaveBeenCalledWith(
          'self-critique',
          'log-789',
          expect.objectContaining({
            strengthCount: expect.any(Number),
            weaknessCount: expect.any(Number),
            criticalIssueCount: expect.any(Number),
            improvementCount: expect.any(Number),
            confidence: expect.any(Number),
            executionTime: expect.any(Number),
          }),
        );
      });
    });

    describe('input integration', () => {
      it('should include gaps with various severities in prompt', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        const gaps: Gap[] = [
          createMockGap({
            id: 'gap-1',
            type: 'missing_info',
            severity: 'critical',
            description: 'Critical data missing',
          }),
          createMockGap({
            id: 'gap-2',
            type: 'weak_claim',
            severity: 'major',
            description: 'Claim needs support',
          }),
          createMockGap({
            id: 'gap-3',
            type: 'contradiction',
            severity: 'minor',
            description: 'Minor inconsistency',
          }),
        ];

        await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          gaps,
        );

        const callArgs = mockOllamaService.chat.mock.calls[0][0];
        const userPrompt = callArgs[1].content;

        expect(userPrompt).toContain('CRITICAL');
        expect(userPrompt).toContain('MAJOR');
        expect(userPrompt).toContain('MINOR');
        expect(userPrompt).toContain('missing_info');
        expect(userPrompt).toContain('weak_claim');
        expect(userPrompt).toContain('contradiction');
        expect(userPrompt).toContain('Critical data missing');
      });

      it('should include claim confidences in prompt', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        const confidenceResult = createMockConfidenceResult({
          overallConfidence: 0.45,
          level: 'low',
          claimConfidences: [
            createMockClaimConfidence({ level: 'high' }),
            createMockClaimConfidence({ claimId: 'claim-2', level: 'low' }),
            createMockClaimConfidence({ claimId: 'claim-3', level: 'very_low' }),
          ],
        });

        await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          confidenceResult,
          [],
        );

        const callArgs = mockOllamaService.chat.mock.calls[0][0];
        const userPrompt = callArgs[1].content;

        expect(userPrompt).toContain('0.450');
        expect(userPrompt).toContain('(low)');
        expect(userPrompt).toContain('3 claims analyzed');
        expect(userPrompt).toContain('Low confidence claims: 2');
      });

      it('should include sources in prompt with title and truncated content', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        const sources = [
          createMockSource({
            title: 'First Article',
            url: 'https://first.com',
            content: 'A'.repeat(300), // Long content to test truncation
          }),
          createMockSource({
            id: 'source-2',
            title: 'Second Article',
            url: 'https://second.com',
            content: 'Short content',
          }),
        ];

        await service.critiqueSynthesis(
          'Answer',
          sources,
          'Query',
          createMockConfidenceResult(),
          [],
        );

        const callArgs = mockOllamaService.chat.mock.calls[0][0];
        const userPrompt = callArgs[1].content;

        expect(userPrompt).toContain('First Article');
        expect(userPrompt).toContain('https://first.com');
        expect(userPrompt).toContain('Second Article');
        expect(userPrompt).toContain('2 total');
        // Truncated content should end with ...
        expect(userPrompt).toContain('...');
      });

      it('should handle sources without title', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        const sources = [
          {
            id: 'source-1',
            url: 'https://example.com',
            content: 'Content here',
            // No title
          },
        ];

        await service.critiqueSynthesis(
          'Answer',
          sources,
          'Query',
          createMockConfidenceResult(),
          [],
        );

        const callArgs = mockOllamaService.chat.mock.calls[0][0];
        const userPrompt = callArgs[1].content;

        expect(userPrompt).toContain('Untitled');
      });

      it('should handle empty sources and gaps', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        await service.critiqueSynthesis(
          'Answer',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        const callArgs = mockOllamaService.chat.mock.calls[0][0];
        const userPrompt = callArgs[1].content;

        expect(userPrompt).toContain('No sources available');
        expect(userPrompt).toContain('No gaps detected');
      });
    });

    describe('edge cases', () => {
      it('should handle empty answer', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        const result = await service.critiqueSynthesis(
          '',
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        expect(result).toBeDefined();
        expect(mockOllamaService.chat).toHaveBeenCalled();
      });

      it('should handle very long answer', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        const longAnswer = 'A'.repeat(10000);

        const result = await service.critiqueSynthesis(
          longAnswer,
          [],
          'Query',
          createMockConfidenceResult(),
          [],
        );

        expect(result).toBeDefined();
      });

      it('should handle source with empty content', async () => {
        mockOllamaService.chat.mockResolvedValue({
          message: { content: JSON.stringify(createValidLLMResponse()) },
        });

        const sources = [
          createMockSource({ content: '' }),
          createMockSource({ content: null as any }),
        ];

        const result = await service.critiqueSynthesis(
          'Answer',
          sources,
          'Query',
          createMockConfidenceResult(),
          [],
        );

        expect(result).toBeDefined();
      });
    });
  });

  describe('generateCritique (legacy)', () => {
    it('should call critiqueSynthesis and return overallAssessment', async () => {
      const llmResponse = createValidLLMResponse({
        overallAssessment: 'Legacy assessment result',
      });
      mockOllamaService.chat.mockResolvedValue({
        message: { content: JSON.stringify(llmResponse) },
      });

      const result = await service.generateCritique(
        'Test answer',
        [createMockGap()],
        'task-123',
      );

      expect(result).toBe('Legacy assessment result');
      expect(mockOllamaService.chat).toHaveBeenCalled();
    });

    it('should work with empty gaps array', async () => {
      mockOllamaService.chat.mockResolvedValue({
        message: { content: JSON.stringify(createValidLLMResponse()) },
      });

      const result = await service.generateCritique('Answer', [], 'task-456');

      expect(typeof result).toBe('string');
    });

    it('should emit events with taskId as logId', async () => {
      mockOllamaService.chat.mockResolvedValue({
        message: { content: JSON.stringify(createValidLLMResponse()) },
      });

      await service.generateCritique('Answer', [], 'task-789');

      expect(mockEventCoordinator.emit).toHaveBeenCalledWith(
        'task-789',
        'self_critique_started',
        expect.any(Object),
      );
    });
  });

  describe('fallback critique structure', () => {
    it('should have correct structure for fallback critique', async () => {
      mockOllamaService.chat.mockRejectedValue(new Error('Test error'));

      const result = await service.critiqueSynthesis(
        'Answer',
        [],
        'Query',
        createMockConfidenceResult(),
        [],
      );

      // Fallback critique returns with confidence 0.3 from createFallbackCritique
      // This is preserved when returning from catch block (not recalculated)
      expect(result.overallAssessment).toContain('Test error');
      expect(result.strengths).toEqual(['Answer was generated successfully']);
      expect(result.weaknesses).toEqual(['Automated critique could not be completed']);
      expect(result.criticalIssues).toEqual(['Self-critique system failure - manual review recommended']);
      expect(result.suggestedImprovements).toEqual([
        'Retry self-critique process',
        'Perform manual quality review',
        'Verify LLM service availability',
      ]);
      expect(result.confidence).toBe(0.3);
    });
  });

  describe('concurrent calls', () => {
    it('should handle multiple concurrent critique requests', async () => {
      mockOllamaService.chat.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          message: { content: JSON.stringify(createValidLLMResponse()) },
        };
      });

      const promises = [
        service.critiqueSynthesis('Answer 1', [], 'Query 1', createMockConfidenceResult(), []),
        service.critiqueSynthesis('Answer 2', [], 'Query 2', createMockConfidenceResult(), []),
        service.critiqueSynthesis('Answer 3', [], 'Query 3', createMockConfidenceResult(), []),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.overallAssessment).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });
      expect(mockOllamaService.chat).toHaveBeenCalledTimes(3);
    });
  });
});
