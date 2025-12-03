import { Test, TestingModule } from '@nestjs/testing';
import { GapDetectorService } from './gap-detector.service';
import { OllamaService } from '../../llm/ollama.service';
import { EventCoordinatorService } from '../../orchestration/services/event-coordinator.service';
import { ResearchLogger } from '../../logging/research-logger.service';
import { Claim } from '../../evaluation/interfaces/claim.interface';
import { ClaimConfidence } from '../../evaluation/interfaces/confidence.interface';
import { EntailmentResult } from '../../evaluation/interfaces/entailment.interface';
import { Gap } from '../interfaces/gap.interface';

describe('GapDetectorService', () => {
  let service: GapDetectorService;
  let ollamaService: jest.Mocked<OllamaService>;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;
  let researchLogger: jest.Mocked<ResearchLogger>;

  // Test data factories
  const createMockClaim = (overrides: Partial<Claim> = {}): Claim => ({
    id: 'claim-1',
    text: 'AI has improved productivity by 40%',
    type: 'factual',
    substantiveWords: [
      { word: 'AI', type: 'noun', position: 0, importance: 0.9 },
      { word: 'productivity', type: 'noun', position: 3, importance: 0.8 },
    ],
    sourceSpan: { start: 0, end: 35 },
    ...overrides,
  });

  const createMockClaimConfidence = (
    overrides: Partial<ClaimConfidence> = {},
  ): ClaimConfidence => ({
    claimId: 'claim-1',
    claimText: 'AI has improved productivity by 40%',
    confidence: 0.75,
    level: 'medium',
    entailmentScore: 0.7,
    suScore: 0.8,
    supportingSources: 2,
    ...overrides,
  });

  const createMockEntailmentResult = (
    overrides: Partial<EntailmentResult> = {},
  ): EntailmentResult => ({
    claim: createMockClaim(),
    verdict: 'entailed',
    score: 0.85,
    supportingSources: [
      {
        sourceId: 'source-1',
        sourceUrl: 'https://example.com/study',
        relevantText: 'Studies show AI improves productivity...',
        similarity: 0.9,
      },
    ],
    contradictingSources: [],
    reasoning: 'Claim is supported by source evidence',
    ...overrides,
  });

  const createMockSource = (overrides: Partial<any> = {}) => ({
    id: 'source-1',
    url: 'https://example.com/study',
    content: 'Studies show AI improves productivity by significant margins...',
    title: 'AI Productivity Research',
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GapDetectorService,
        {
          provide: OllamaService,
          useValue: {
            chat: jest.fn(),
          },
        },
        {
          provide: EventCoordinatorService,
          useValue: {
            emit: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ResearchLogger,
          useValue: {
            log: jest.fn(),
            logStageError: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GapDetectorService>(GapDetectorService);
    ollamaService = module.get(OllamaService);
    eventCoordinator = module.get(EventCoordinatorService);
    researchLogger = module.get(ResearchLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectGaps', () => {
    describe('SSE Events', () => {
      it('should emit gap_detection_started event when logId is provided', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim()],
          [createMockClaimConfidence()],
          [createMockEntailmentResult()],
          'test query',
          'log-123',
        );

        expect(eventCoordinator.emit).toHaveBeenCalledWith(
          'log-123',
          'gap_detection_started',
          expect.objectContaining({
            query: 'test query',
            claimsCount: 1,
            sourcesCount: 1,
          }),
        );
      });

      it('should emit gap_detection_completed event with gap summary', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim()],
          [createMockClaimConfidence()],
          [createMockEntailmentResult()],
          'test query',
          'log-123',
        );

        expect(eventCoordinator.emit).toHaveBeenCalledWith(
          'log-123',
          'gap_detection_completed',
          expect.objectContaining({
            totalGaps: expect.any(Number),
            criticalGaps: expect.any(Number),
            gapTypes: expect.any(Object),
            durationMs: expect.any(Number),
          }),
        );
      });

      it('should NOT emit events when logId is not provided', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim()],
          [createMockClaimConfidence()],
          [createMockEntailmentResult()],
          'test query',
        );

        expect(eventCoordinator.emit).not.toHaveBeenCalled();
      });

      it('should emit gap_detected event for each gap found', async () => {
        const lowConfidenceClaim = createMockClaimConfidence({
          claimId: 'claim-weak',
          confidence: 0.3,
          level: 'low',
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim({ id: 'claim-weak' })],
          [lowConfidenceClaim],
          [createMockEntailmentResult({ claim: createMockClaim({ id: 'claim-weak' }) })],
          'test query',
          'log-123',
        );

        expect(eventCoordinator.emit).toHaveBeenCalledWith(
          'log-123',
          'gap_detected',
          expect.objectContaining({
            type: 'weak_claim',
            severity: 'major',
            claimId: 'claim-weak',
            confidence: 0.3,
          }),
        );
      });
    });

    describe('Weak Claims Detection', () => {
      it('should detect claims with confidence < 0.5 as weak claims', async () => {
        const weakClaim = createMockClaimConfidence({
          claimId: 'claim-weak',
          claimText: 'Unverified claim about performance',
          confidence: 0.3,
          level: 'low',
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim({ id: 'claim-weak' })],
          [weakClaim],
          [createMockEntailmentResult({ claim: createMockClaim({ id: 'claim-weak' }) })],
          'test query',
        );

        const weakClaimGaps = gaps.filter((g) => g.type === 'weak_claim');
        expect(weakClaimGaps.length).toBeGreaterThan(0);
        expect(weakClaimGaps[0]).toMatchObject({
          type: 'weak_claim',
          severity: 'major',
          confidence: 0.3,
        });
        expect(weakClaimGaps[0].description).toContain('30.0%');
      });

      it('should NOT flag claims with confidence >= 0.5 as weak', async () => {
        const strongClaim = createMockClaimConfidence({
          confidence: 0.6,
          level: 'medium',
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim()],
          [strongClaim],
          [createMockEntailmentResult()],
          'test query',
        );

        const weakClaimGaps = gaps.filter((g) => g.type === 'weak_claim');
        expect(weakClaimGaps.length).toBe(0);
      });

      it('should detect multiple weak claims', async () => {
        const weakClaims = [
          createMockClaimConfidence({
            claimId: 'claim-1',
            claimText: 'First weak claim',
            confidence: 0.2,
            level: 'very_low',
          }),
          createMockClaimConfidence({
            claimId: 'claim-2',
            claimText: 'Second weak claim',
            confidence: 0.4,
            level: 'low',
          }),
        ];

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim({ id: 'claim-1' }), createMockClaim({ id: 'claim-2' })],
          weakClaims,
          [],
          'test query',
        );

        const weakClaimGaps = gaps.filter((g) => g.type === 'weak_claim');
        expect(weakClaimGaps.length).toBe(2);
      });

      it('should link weak claim gap to related claim object', async () => {
        const claim = createMockClaim({ id: 'claim-linked' });
        const claimConfidence = createMockClaimConfidence({
          claimId: 'claim-linked',
          confidence: 0.25,
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [claim],
          [claimConfidence],
          [],
          'test query',
        );

        const weakGap = gaps.find((g) => g.type === 'weak_claim');
        expect(weakGap?.relatedClaim).toBeDefined();
        expect(weakGap?.relatedClaim?.id).toBe('claim-linked');
      });
    });

    describe('Missing Information Detection (LLM)', () => {
      it('should detect missing information via LLM analysis', async () => {
        const llmResponse = JSON.stringify([
          {
            description: 'Missing comparison with traditional methods',
            severity: 'major',
            suggestedAction: 'Add benchmarks against manual processes',
          },
        ]);

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: llmResponse },
        } as any);

        const gaps = await service.detectGaps(
          'AI improves productivity',
          [createMockSource()],
          [],
          [],
          [],
          'How does AI compare to traditional methods?',
        );

        const missingInfoGaps = gaps.filter((g) => g.type === 'missing_info');
        expect(missingInfoGaps.length).toBe(1);
        expect(missingInfoGaps[0]).toMatchObject({
          type: 'missing_info',
          severity: 'major',
          description: 'Missing comparison with traditional methods',
          suggestedAction: 'Add benchmarks against manual processes',
          confidence: 0.7, // LLM-detected gaps have moderate confidence
        });
      });

      it('should handle LLM response with markdown code blocks', async () => {
        const llmResponse = '```json\n[{"description": "Missing data sources", "severity": "critical", "suggestedAction": "Include primary research"}]\n```';

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: llmResponse },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
        );

        const missingInfoGaps = gaps.filter((g) => g.type === 'missing_info');
        expect(missingInfoGaps.length).toBe(1);
        expect(missingInfoGaps[0].severity).toBe('critical');
      });

      it('should handle multiple missing info items from LLM', async () => {
        const llmResponse = JSON.stringify([
          {
            description: 'Gap 1',
            severity: 'major',
            suggestedAction: 'Action 1',
          },
          {
            description: 'Gap 2',
            severity: 'minor',
            suggestedAction: 'Action 2',
          },
          {
            description: 'Gap 3',
            severity: 'critical',
            suggestedAction: 'Action 3',
          },
        ]);

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: llmResponse },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
        );

        const missingInfoGaps = gaps.filter((g) => g.type === 'missing_info');
        expect(missingInfoGaps.length).toBe(3);
      });

      it('should normalize severity values from LLM', async () => {
        const llmResponse = JSON.stringify([
          { description: 'Gap 1', severity: 'CRITICAL', suggestedAction: 'Action' },
          { description: 'Gap 2', severity: 'high', suggestedAction: 'Action' },
          { description: 'Gap 3', severity: 'low', suggestedAction: 'Action' },
        ]);

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: llmResponse },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
        );

        const severities = gaps
          .filter((g) => g.type === 'missing_info')
          .map((g) => g.severity);
        expect(severities).toContain('critical');
        expect(severities).toContain('major'); // 'high' normalized to 'major'
        expect(severities).toContain('minor'); // 'low' normalized to 'minor'
      });

      it('should truncate long descriptions and actions', async () => {
        const longText = 'A'.repeat(300);
        const llmResponse = JSON.stringify([
          {
            description: longText,
            severity: 'major',
            suggestedAction: longText,
          },
        ]);

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: llmResponse },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
        );

        const gap = gaps.find((g) => g.type === 'missing_info');
        expect(gap?.description.length).toBeLessThanOrEqual(200);
        expect(gap?.suggestedAction.length).toBeLessThanOrEqual(200);
      });
    });

    describe('Source Coverage Gaps', () => {
      it('should detect claims without supporting sources', async () => {
        const claimWithoutSupport = createMockClaimConfidence({
          claimId: 'claim-unsupported',
          supportingSources: 0,
        });
        const entailmentWithoutSupport = createMockEntailmentResult({
          claim: createMockClaim({ id: 'claim-unsupported' }),
          supportingSources: [],
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim({ id: 'claim-unsupported' })],
          [claimWithoutSupport],
          [entailmentWithoutSupport],
          'test query',
        );

        const coverageGaps = gaps.filter((g) => g.type === 'incomplete_coverage');
        expect(coverageGaps.length).toBe(1);
        expect(coverageGaps[0]).toMatchObject({
          type: 'incomplete_coverage',
          severity: 'critical',
          confidence: 0.95,
        });
      });

      it('should NOT flag claims with entailment support even if supportingSources is 0', async () => {
        const claimConfidence = createMockClaimConfidence({
          claimId: 'claim-1',
          supportingSources: 0,
        });
        const entailmentWithSupport = createMockEntailmentResult({
          claim: createMockClaim({ id: 'claim-1' }),
          supportingSources: [
            {
              sourceId: 'source-1',
              sourceUrl: 'https://example.com',
              relevantText: 'Supporting evidence',
              similarity: 0.9,
            },
          ],
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim({ id: 'claim-1' })],
          [claimConfidence],
          [entailmentWithSupport],
          'test query',
        );

        const coverageGaps = gaps.filter((g) => g.type === 'incomplete_coverage');
        expect(coverageGaps.length).toBe(0);
      });

      it('should emit gap_detected event for source coverage gaps', async () => {
        const claimWithoutSupport = createMockClaimConfidence({
          claimId: 'claim-no-support',
          supportingSources: 0,
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim({ id: 'claim-no-support' })],
          [claimWithoutSupport],
          [],
          'test query',
          'log-123',
        );

        expect(eventCoordinator.emit).toHaveBeenCalledWith(
          'log-123',
          'gap_detected',
          expect.objectContaining({
            type: 'incomplete_coverage',
            severity: 'critical',
            claimId: 'claim-no-support',
          }),
        );
      });
    });

    describe('Contradiction Detection', () => {
      it('should detect claims contradicted by sources', async () => {
        const contradictedClaim = createMockClaim({
          id: 'claim-contradicted',
          text: 'AI decreases productivity',
        });
        const entailmentContradicted = createMockEntailmentResult({
          claim: contradictedClaim,
          verdict: 'contradicted',
          contradictingSources: [
            {
              sourceId: 'source-1',
              sourceUrl: 'https://example.com/contrary',
              relevantText: 'Studies show AI increases productivity',
              similarity: 0.85,
            },
          ],
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [contradictedClaim],
          [createMockClaimConfidence({ claimId: 'claim-contradicted' })],
          [entailmentContradicted],
          'test query',
        );

        const contradictionGaps = gaps.filter((g) => g.type === 'contradiction');
        expect(contradictionGaps.length).toBe(1);
        expect(contradictionGaps[0]).toMatchObject({
          type: 'contradiction',
          severity: 'critical',
          confidence: 0.9,
        });
        expect(contradictionGaps[0].description).toContain('contradicted');
        expect(contradictionGaps[0].suggestedAction).toContain(
          'https://example.com/contrary',
        );
      });

      it('should NOT flag entailed or neutral verdicts as contradictions', async () => {
        const entailedResult = createMockEntailmentResult({
          verdict: 'entailed',
        });
        const neutralResult = createMockEntailmentResult({
          claim: createMockClaim({ id: 'claim-2' }),
          verdict: 'neutral',
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim(), createMockClaim({ id: 'claim-2' })],
          [
            createMockClaimConfidence(),
            createMockClaimConfidence({ claimId: 'claim-2' }),
          ],
          [entailedResult, neutralResult],
          'test query',
        );

        const contradictionGaps = gaps.filter((g) => g.type === 'contradiction');
        expect(contradictionGaps.length).toBe(0);
      });

      it('should include all contradicting source URLs in suggested action', async () => {
        const entailmentMultipleContradictions = createMockEntailmentResult({
          claim: createMockClaim({ id: 'claim-multi' }),
          verdict: 'contradicted',
          contradictingSources: [
            {
              sourceId: 'source-1',
              sourceUrl: 'https://example.com/source1',
              relevantText: 'Contrary evidence 1',
              similarity: 0.8,
            },
            {
              sourceId: 'source-2',
              sourceUrl: 'https://example.com/source2',
              relevantText: 'Contrary evidence 2',
              similarity: 0.75,
            },
          ],
        });

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim({ id: 'claim-multi' })],
          [createMockClaimConfidence({ claimId: 'claim-multi' })],
          [entailmentMultipleContradictions],
          'test query',
        );

        const contradictionGap = gaps.find((g) => g.type === 'contradiction');
        expect(contradictionGap?.suggestedAction).toContain(
          'https://example.com/source1',
        );
        expect(contradictionGap?.suggestedAction).toContain(
          'https://example.com/source2',
        );
      });
    });

    describe('Error Handling', () => {
      it('should continue gap detection when LLM fails', async () => {
        ollamaService.chat.mockRejectedValue(new Error('LLM service unavailable'));

        const weakClaim = createMockClaimConfidence({
          claimId: 'claim-weak',
          confidence: 0.2,
        });

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim({ id: 'claim-weak' })],
          [weakClaim],
          [],
          'test query',
        );

        // Should still detect weak claims even though LLM failed
        const weakClaimGaps = gaps.filter((g) => g.type === 'weak_claim');
        expect(weakClaimGaps.length).toBe(1);

        // No missing_info gaps because LLM failed
        const missingInfoGaps = gaps.filter((g) => g.type === 'missing_info');
        expect(missingInfoGaps.length).toBe(0);
      });

      it('should log error when LLM fails', async () => {
        ollamaService.chat.mockRejectedValue(
          new Error('Connection timeout'),
        );

        await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
          'log-123',
        );

        expect(researchLogger.log).toHaveBeenCalledWith(
          'log-123',
          'gap-detector',
          'llm-gap-detection-error',
          expect.objectContaining({
            error: 'Connection timeout',
          }),
        );
      });

      it('should handle invalid JSON from LLM gracefully', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: 'This is not valid JSON' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
        );

        // Should return empty missing_info but not crash
        const missingInfoGaps = gaps.filter((g) => g.type === 'missing_info');
        expect(missingInfoGaps.length).toBe(0);
      });

      it('should handle LLM returning non-array JSON', async () => {
        ollamaService.chat.mockResolvedValue({
          message: {
            role: 'assistant',
            content: '{"description": "Not an array"}',
          },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
        );

        const missingInfoGaps = gaps.filter((g) => g.type === 'missing_info');
        expect(missingInfoGaps.length).toBe(0);
      });

      it('should filter out incomplete LLM response items', async () => {
        const llmResponse = JSON.stringify([
          { description: 'Valid gap', severity: 'major', suggestedAction: 'Fix it' },
          { description: 'Missing severity' }, // Missing required fields
          { severity: 'major', suggestedAction: 'Missing description' }, // Missing description
          null,
          'invalid string item',
        ]);

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: llmResponse },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
        );

        const missingInfoGaps = gaps.filter((g) => g.type === 'missing_info');
        expect(missingInfoGaps.length).toBe(1);
        expect(missingInfoGaps[0].description).toBe('Valid gap');
      });

      it('should emit error event when detectGaps throws', async () => {
        // Force an error by making the main flow throw
        jest.spyOn(service as any, 'detectWeakClaims').mockRejectedValue(
          new Error('Unexpected error'),
        );

        await expect(
          service.detectGaps(
            'Test answer',
            [createMockSource()],
            [],
            [],
            [],
            'test query',
            'log-123',
          ),
        ).rejects.toThrow('Unexpected error');

        expect(eventCoordinator.emit).toHaveBeenCalledWith(
          'log-123',
          'gap_detection_completed',
          expect.objectContaining({
            error: 'Unexpected error',
            durationMs: expect.any(Number),
          }),
        );

        expect(researchLogger.logStageError).toHaveBeenCalledWith(
          0,
          'log-123',
          expect.any(Error),
        );
      });
    });

    describe('Empty Inputs', () => {
      it('should handle empty claims array', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [], // Empty claims
          [],
          [],
          'test query',
        );

        // Should complete without errors
        expect(gaps).toBeDefined();
        expect(Array.isArray(gaps)).toBe(true);
      });

      it('should handle empty sources array', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [], // Empty sources
          [createMockClaim()],
          [createMockClaimConfidence()],
          [],
          'test query',
        );

        expect(gaps).toBeDefined();
      });

      it('should handle empty claimConfidences array', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim()],
          [], // Empty claimConfidences
          [],
          'test query',
        );

        // No weak claims since no confidence data
        const weakClaimGaps = gaps.filter((g) => g.type === 'weak_claim');
        expect(weakClaimGaps.length).toBe(0);
      });

      it('should handle empty entailmentResults array', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim()],
          [createMockClaimConfidence()],
          [], // Empty entailmentResults
          'test query',
        );

        // No contradiction gaps since no entailment data
        const contradictionGaps = gaps.filter((g) => g.type === 'contradiction');
        expect(contradictionGaps.length).toBe(0);
      });

      it('should handle all empty arrays', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [],
          [],
          [],
          [],
          'test query',
        );

        expect(gaps).toEqual([]);
      });

      it('should handle empty answer string', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          '', // Empty answer
          [createMockSource()],
          [],
          [],
          [],
          'test query',
        );

        expect(gaps).toBeDefined();
      });
    });

    describe('Gap Type Aggregation', () => {
      it('should aggregate gap types correctly in completion event', async () => {
        // Create a scenario with multiple gap types
        const weakClaim = createMockClaimConfidence({
          claimId: 'claim-weak',
          confidence: 0.3,
        });
        const contradictedEntailment = createMockEntailmentResult({
          claim: createMockClaim({ id: 'claim-contradicted' }),
          verdict: 'contradicted',
          contradictingSources: [
            {
              sourceId: 's1',
              sourceUrl: 'https://example.com',
              relevantText: 'text',
              similarity: 0.8,
            },
          ],
        });
        const unsupportedClaim = createMockClaimConfidence({
          claimId: 'claim-unsupported',
          supportingSources: 0,
        });

        ollamaService.chat.mockResolvedValue({
          message: {
            role: 'assistant',
            content: JSON.stringify([
              {
                description: 'Missing context',
                severity: 'minor',
                suggestedAction: 'Add context',
              },
            ]),
          },
        } as any);

        await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [
            createMockClaim({ id: 'claim-weak' }),
            createMockClaim({ id: 'claim-contradicted' }),
            createMockClaim({ id: 'claim-unsupported' }),
          ],
          [weakClaim, unsupportedClaim, createMockClaimConfidence({ claimId: 'claim-contradicted' })],
          [contradictedEntailment],
          'test query',
          'log-123',
        );

        expect(eventCoordinator.emit).toHaveBeenCalledWith(
          'log-123',
          'gap_detection_completed',
          expect.objectContaining({
            gapTypes: {
              missing_info: 1,
              weak_claim: 1,
              contradiction: 1,
              incomplete_coverage: 1,
            },
          }),
        );
      });
    });

    describe('Logging', () => {
      it('should log start of gap detection', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          [createMockSource(), createMockSource({ id: 'source-2' })],
          [createMockClaim()],
          [createMockClaimConfidence()],
          [],
          'test query',
          'log-123',
        );

        expect(researchLogger.log).toHaveBeenCalledWith(
          'log-123',
          'gap-detector',
          'detect-gaps-start',
          expect.objectContaining({
            query: 'test query',
            claimsCount: 1,
            sourcesCount: 2,
          }),
        );
      });

      it('should log completion of gap detection', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
          'log-123',
        );

        expect(researchLogger.log).toHaveBeenCalledWith(
          'log-123',
          'gap-detector',
          'detect-gaps-complete',
          expect.objectContaining({
            totalGaps: expect.any(Number),
            criticalGaps: expect.any(Number),
            durationMs: expect.any(Number),
          }),
        );
      });

      it('should use "unknown" logId when not provided', async () => {
        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [],
          [],
          [],
          'test query',
        );

        expect(researchLogger.log).toHaveBeenCalledWith(
          'unknown',
          'gap-detector',
          'detect-gaps-start',
          expect.any(Object),
        );
      });
    });

    describe('Gap ID Generation', () => {
      it('should generate unique IDs for each gap', async () => {
        const weakClaims = [
          createMockClaimConfidence({
            claimId: 'claim-1',
            confidence: 0.1,
          }),
          createMockClaimConfidence({
            claimId: 'claim-2',
            confidence: 0.2,
          }),
        ];

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        const gaps = await service.detectGaps(
          'Test answer',
          [createMockSource()],
          [createMockClaim({ id: 'claim-1' }), createMockClaim({ id: 'claim-2' })],
          weakClaims,
          [],
          'test query',
        );

        const ids = gaps.map((g) => g.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
        expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(
          true,
        );
      });
    });

    describe('Integration Scenarios', () => {
      it('should detect all gap types in a complex scenario', async () => {
        // Setup complex scenario
        const claims = [
          createMockClaim({ id: 'claim-weak', text: 'Weak claim' }),
          createMockClaim({ id: 'claim-contradicted', text: 'Contradicted claim' }),
          createMockClaim({ id: 'claim-unsupported', text: 'Unsupported claim' }),
          createMockClaim({ id: 'claim-valid', text: 'Valid claim' }),
        ];

        const claimConfidences = [
          createMockClaimConfidence({ claimId: 'claim-weak', confidence: 0.25 }),
          createMockClaimConfidence({
            claimId: 'claim-contradicted',
            confidence: 0.6,
          }),
          createMockClaimConfidence({
            claimId: 'claim-unsupported',
            confidence: 0.7,
            supportingSources: 0,
          }),
          createMockClaimConfidence({
            claimId: 'claim-valid',
            confidence: 0.9,
            supportingSources: 3,
          }),
        ];

        const entailmentResults = [
          createMockEntailmentResult({
            claim: claims[1],
            verdict: 'contradicted',
            contradictingSources: [
              {
                sourceId: 's1',
                sourceUrl: 'https://example.com/contra',
                relevantText: 'Contrary evidence',
                similarity: 0.85,
              },
            ],
          }),
          createMockEntailmentResult({
            claim: claims[3],
            verdict: 'entailed',
            supportingSources: [
              {
                sourceId: 's2',
                sourceUrl: 'https://example.com/support',
                relevantText: 'Supporting evidence',
                similarity: 0.9,
              },
            ],
          }),
        ];

        ollamaService.chat.mockResolvedValue({
          message: {
            role: 'assistant',
            content: JSON.stringify([
              {
                description: 'Missing implementation details',
                severity: 'major',
                suggestedAction: 'Add technical specifications',
              },
            ]),
          },
        } as any);

        const gaps = await service.detectGaps(
          'Complex answer with multiple issues',
          [createMockSource()],
          claims,
          claimConfidences,
          entailmentResults,
          'complex query',
          'log-integration',
        );

        // Verify all gap types are detected
        const gapTypes = new Set(gaps.map((g) => g.type));
        expect(gapTypes.has('weak_claim')).toBe(true);
        expect(gapTypes.has('contradiction')).toBe(true);
        expect(gapTypes.has('incomplete_coverage')).toBe(true);
        expect(gapTypes.has('missing_info')).toBe(true);

        // Verify critical gaps are counted correctly
        const criticalGaps = gaps.filter((g) => g.severity === 'critical');
        expect(criticalGaps.length).toBeGreaterThanOrEqual(2); // contradiction + incomplete_coverage
      });

      it('should pass source titles to LLM for context', async () => {
        const sources = [
          createMockSource({ title: 'AI Research Paper' }),
          createMockSource({ id: 'source-2', title: 'Productivity Study', url: 'https://example.com/prod' }),
        ];

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          sources,
          [],
          [],
          [],
          'test query',
        );

        expect(ollamaService.chat).toHaveBeenCalledWith([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('AI Research Paper'),
          }),
        ]);
        expect(ollamaService.chat).toHaveBeenCalledWith([
          expect.any(Object),
          expect.objectContaining({
            content: expect.stringContaining('Productivity Study'),
          }),
        ]);
      });

      it('should limit source titles to 10 in LLM prompt', async () => {
        const sources = Array.from({ length: 15 }, (_, i) =>
          createMockSource({ id: `source-${i}`, title: `Source ${i}` }),
        );

        ollamaService.chat.mockResolvedValue({
          message: { role: 'assistant', content: '[]' },
        } as any);

        await service.detectGaps(
          'Test answer',
          sources,
          [],
          [],
          [],
          'test query',
        );

        const chatCall = ollamaService.chat.mock.calls[0][0];
        const userMessage = chatCall.find((m: any) => m.role === 'user');

        // Should contain first 10 sources but not source 10+
        expect(userMessage.content).toContain('Source 0');
        expect(userMessage.content).toContain('Source 9');
        expect(userMessage.content).not.toContain('Source 10');
      });
    });
  });
});
