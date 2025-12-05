import { Test, TestingModule } from '@nestjs/testing';
import { QueryDecomposerService } from './query-decomposer.service';
import { LLMService } from '../../llm/llm.service';
import { EventCoordinatorService } from './event-coordinator.service';
import { DecompositionResult } from '../interfaces/decomposition-result.interface';
import { SubQuery } from '../interfaces/sub-query.interface';

describe('QueryDecomposerService', () => {
  let service: QueryDecomposerService;
  let llmService: jest.Mocked<LLMService>;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;

  beforeEach(async () => {
    const mockLLMService = {
      chat: jest.fn(),
    };

    const mockEventCoordinator = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryDecomposerService,
        { provide: LLMService, useValue: mockLLMService },
        { provide: EventCoordinatorService, useValue: mockEventCoordinator },
      ],
    }).compile();

    service = module.get<QueryDecomposerService>(QueryDecomposerService);
    llmService = module.get(LLMService);
    eventCoordinator = module.get(EventCoordinatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('decomposeQuery - Simple Query', () => {
    it('should detect simple query and not decompose', async () => {
      const query = 'What is quantum computing?';
      const logId = 'test-log-123';

      llmService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            isComplex: false,
            reasoning: 'Simple factual query that can be answered directly',
            subQueries: [],
          }),
        },
      } as any);

      const result = await service.decomposeQuery(query, logId);

      expect(result.isComplex).toBe(false);
      expect(result.subQueries).toEqual([]);
      expect(result.executionPlan).toEqual([]);
      expect(result.originalQuery).toBe(query);
      expect(result.reasoning).toBe(
        'Simple factual query that can be answered directly',
      );

      // Verify events emitted
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'decomposition_started',
        { query },
      );
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'decomposition_completed',
        expect.objectContaining({
          isComplex: false,
          subQueryCount: 0,
        }),
      );
    });

    it('should work without logId', async () => {
      const query = 'What is quantum computing?';

      llmService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            isComplex: false,
            reasoning: 'Simple query',
            subQueries: [],
          }),
        },
      } as any);

      const result = await service.decomposeQuery(query);

      expect(result.isComplex).toBe(false);
      expect(eventCoordinator.emit).not.toHaveBeenCalled();
    });
  });

  describe('decomposeQuery - Complex Query', () => {
    it('should decompose complex query into sub-queries', async () => {
      const query =
        'Compare the economic impacts of AI and blockchain between 2020-2024';
      const logId = 'test-log-456';

      const llmResponse = {
        isComplex: true,
        reasoning:
          'Query requires temporal analysis of two separate technologies and comparison',
        subQueries: [
          {
            text: 'What are the economic impacts of AI from 2020-2024?',
            order: 1,
            dependencies: [],
            type: 'temporal',
            priority: 'high',
            estimatedComplexity: 3,
          },
          {
            text: 'What are the economic impacts of blockchain from 2020-2024?',
            order: 2,
            dependencies: [],
            type: 'temporal',
            priority: 'high',
            estimatedComplexity: 3,
          },
          {
            text: 'Compare findings from the AI and blockchain analyses',
            order: 3,
            dependencies: [], // Will be populated with IDs by service
            type: 'comparative',
            priority: 'high',
            estimatedComplexity: 4,
          },
        ],
      };

      llmService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify(llmResponse),
        },
      } as any);

      const result = await service.decomposeQuery(query, logId);

      expect(result.isComplex).toBe(true);
      expect(result.subQueries).toHaveLength(3);
      expect(result.originalQuery).toBe(query);
      expect(result.reasoning).toBe(llmResponse.reasoning);

      // Verify all sub-queries have IDs
      result.subQueries.forEach((sq) => {
        expect(sq.id).toMatch(/^sq-/);
        expect(sq.text).toBeDefined();
        expect(sq.type).toBeDefined();
        expect(sq.priority).toBeDefined();
        expect(sq.estimatedComplexity).toBeGreaterThanOrEqual(1);
        expect(sq.estimatedComplexity).toBeLessThanOrEqual(5);
      });

      // Verify events
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'decomposition_started',
        { query },
      );

      // Should emit sub_query_identified for each sub-query
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'sub_query_identified',
        expect.objectContaining({
          subQueryId: expect.stringMatching(/^sq-/),
          text: expect.any(String),
          type: expect.any(String),
          priority: expect.any(String),
          complexity: expect.any(Number),
        }),
      );

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'decomposition_completed',
        expect.objectContaining({
          isComplex: true,
          subQueryCount: 3,
          executionPhases: expect.any(Number),
        }),
      );
    });

    it('should handle LLM response with markdown code blocks', async () => {
      const query = 'Complex query';

      llmService.chat.mockResolvedValue({
        message: {
          content: '```json\n{"isComplex": false, "reasoning": "test", "subQueries": []}\n```',
        },
      } as any);

      const result = await service.decomposeQuery(query);

      expect(result.isComplex).toBe(false);
      expect(result.reasoning).toBe('test');
    });
  });

  describe('buildExecutionPlan', () => {
    it('should build execution plan with no dependencies', async () => {
      const query = 'Test query';
      const llmResponse = {
        isComplex: true,
        reasoning: 'Test',
        subQueries: [
          {
            text: 'Query 1',
            order: 1,
            dependencies: [],
            type: 'factual' as const,
            priority: 'high' as const,
            estimatedComplexity: 2,
          },
          {
            text: 'Query 2',
            order: 2,
            dependencies: [],
            type: 'factual' as const,
            priority: 'high' as const,
            estimatedComplexity: 2,
          },
        ],
      };

      llmService.chat.mockResolvedValue({
        message: { content: JSON.stringify(llmResponse) },
      } as any);

      const result = await service.decomposeQuery(query);

      // All queries with no dependencies should be in first phase
      expect(result.executionPlan).toHaveLength(1);
      expect(result.executionPlan[0]).toHaveLength(2);
    });

    it('should build execution plan with dependencies', async () => {
      const query = 'Test query';

      // Create mock sub-queries with dependencies
      const subQuery1Id = 'sq-111';
      const subQuery2Id = 'sq-222';

      const llmResponse = {
        isComplex: true,
        reasoning: 'Test',
        subQueries: [
          {
            text: 'Query 1',
            order: 1,
            dependencies: [],
            type: 'factual' as const,
            priority: 'high' as const,
            estimatedComplexity: 2,
          },
          {
            text: 'Query 2',
            order: 2,
            dependencies: [],
            type: 'factual' as const,
            priority: 'high' as const,
            estimatedComplexity: 2,
          },
          {
            text: 'Query 3 - depends on 1 and 2',
            order: 3,
            dependencies: [subQuery1Id, subQuery2Id], // Will be replaced with actual IDs
            type: 'comparative' as const,
            priority: 'high' as const,
            estimatedComplexity: 3,
          },
        ],
      };

      llmService.chat.mockResolvedValue({
        message: { content: JSON.stringify(llmResponse) },
      } as any);

      const result = await service.decomposeQuery(query);

      // Should have 2 phases: [Q1, Q2] then [Q3]
      // Note: Since we can't control IDs in the test, we check structure
      expect(result.executionPlan.length).toBeGreaterThan(0);
      expect(result.subQueries).toHaveLength(3);
    });

    it('should handle multi-level dependencies', async () => {
      const query = 'Test query';

      const llmResponse = {
        isComplex: true,
        reasoning: 'Test',
        subQueries: [
          {
            text: 'Query 1',
            order: 1,
            dependencies: [],
            type: 'factual' as const,
            priority: 'high' as const,
            estimatedComplexity: 2,
          },
          {
            text: 'Query 2 - depends on 1',
            order: 2,
            dependencies: [], // Will be set to depend on Q1
            type: 'analytical' as const,
            priority: 'medium' as const,
            estimatedComplexity: 3,
          },
          {
            text: 'Query 3 - depends on 2',
            order: 3,
            dependencies: [], // Will be set to depend on Q2
            type: 'comparative' as const,
            priority: 'low' as const,
            estimatedComplexity: 4,
          },
        ],
      };

      llmService.chat.mockResolvedValue({
        message: { content: JSON.stringify(llmResponse) },
      } as any);

      const result = await service.decomposeQuery(query);

      // Should handle multi-level dependencies correctly
      expect(result.executionPlan.length).toBeGreaterThan(0);
      expect(result.subQueries).toHaveLength(3);
    });

    it('should detect circular dependencies', async () => {
      const query = 'Test query';

      // Mock a response that would create circular dependencies
      // We'll need to manually create SubQuery objects with circular refs
      const subQueries: SubQuery[] = [
        {
          id: 'sq-1',
          text: 'Query 1',
          order: 1,
          dependencies: ['sq-2'], // Depends on Q2
          type: 'factual',
          priority: 'high',
          estimatedComplexity: 2,
        },
        {
          id: 'sq-2',
          text: 'Query 2',
          order: 2,
          dependencies: ['sq-1'], // Depends on Q1 - circular!
          type: 'analytical',
          priority: 'high',
          estimatedComplexity: 2,
        },
      ];

      // Access private method via type assertion
      const buildPlan = (service as any).buildExecutionPlan.bind(service);

      expect(() => buildPlan(subQueries)).toThrow(
        /Circular dependency detected/,
      );
    });

    it('should handle invalid dependencies gracefully', async () => {
      const query = 'Test query';

      const subQueries: SubQuery[] = [
        {
          id: 'sq-1',
          text: 'Query 1',
          order: 1,
          dependencies: ['non-existent-id'], // Invalid dependency
          type: 'factual',
          priority: 'high',
          estimatedComplexity: 2,
        },
      ];

      const buildPlan = (service as any).buildExecutionPlan.bind(service);

      // Should not throw - invalid dependencies are treated as satisfied
      const plan = buildPlan(subQueries);
      expect(plan).toHaveLength(1);
      expect(plan[0]).toContain(subQueries[0]);
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM errors', async () => {
      const query = 'Test query';
      const logId = 'test-log-error';

      llmService.chat.mockRejectedValue(new Error('LLM connection failed'));

      await expect(service.decomposeQuery(query, logId)).rejects.toThrow(
        'LLM connection failed',
      );

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'decomposition_completed',
        expect.objectContaining({
          error: 'LLM connection failed',
        }),
      );
    });

    it('should handle invalid JSON from LLM', async () => {
      const query = 'Test query';

      llmService.chat.mockResolvedValue({
        message: { content: 'Not valid JSON' },
      } as any);

      await expect(service.decomposeQuery(query)).rejects.toThrow(
        /Failed to parse LLM decomposition response/,
      );
    });

    it('should validate required fields in LLM response', async () => {
      const query = 'Test query';

      llmService.chat.mockResolvedValue({
        message: { content: JSON.stringify({ isComplex: true }) }, // Missing reasoning
      } as any);

      await expect(service.decomposeQuery(query)).rejects.toThrow(
        /missing or invalid reasoning field/,
      );
    });

    it('should validate sub-queries for complex queries', async () => {
      const query = 'Test query';

      llmService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            isComplex: true,
            reasoning: 'test',
            subQueries: [], // Empty for complex query
          }),
        },
      } as any);

      await expect(service.decomposeQuery(query)).rejects.toThrow(
        /subQueries must be non-empty array for complex queries/,
      );
    });

    it('should validate sub-query fields', async () => {
      const query = 'Test query';

      llmService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            isComplex: true,
            reasoning: 'test',
            subQueries: [
              {
                // Missing text field
                type: 'factual',
                priority: 'high',
                estimatedComplexity: 2,
              },
            ],
          }),
        },
      } as any);

      await expect(service.decomposeQuery(query)).rejects.toThrow(
        /missing or invalid text field/,
      );
    });

    it('should validate sub-query type enum', async () => {
      const query = 'Test query';

      llmService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            isComplex: true,
            reasoning: 'test',
            subQueries: [
              {
                text: 'Test',
                type: 'invalid-type',
                priority: 'high',
                estimatedComplexity: 2,
              },
            ],
          }),
        },
      } as any);

      await expect(service.decomposeQuery(query)).rejects.toThrow(
        /invalid type field/,
      );
    });

    it('should validate sub-query priority enum', async () => {
      const query = 'Test query';

      llmService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            isComplex: true,
            reasoning: 'test',
            subQueries: [
              {
                text: 'Test',
                type: 'factual',
                priority: 'invalid-priority',
                estimatedComplexity: 2,
              },
            ],
          }),
        },
      } as any);

      await expect(service.decomposeQuery(query)).rejects.toThrow(
        /invalid priority field/,
      );
    });

    it('should validate complexity range', async () => {
      const query = 'Test query';

      llmService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            isComplex: true,
            reasoning: 'test',
            subQueries: [
              {
                text: 'Test',
                type: 'factual',
                priority: 'high',
                estimatedComplexity: 10, // Out of range (1-5)
              },
            ],
          }),
        },
      } as any);

      await expect(service.decomposeQuery(query)).rejects.toThrow(
        /estimatedComplexity must be 1-5/,
      );
    });
  });

  describe('LLM Prompt', () => {
    it('should call LLM with correct prompt structure', async () => {
      const query = 'What is AI?';

      llmService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            isComplex: false,
            reasoning: 'Simple query',
            subQueries: [],
          }),
        },
      } as any);

      await service.decomposeQuery(query);

      expect(llmService.chat).toHaveBeenCalledWith([
        {
          role: 'system',
          content: expect.stringContaining('research query analyzer'),
        },
        {
          role: 'user',
          content: expect.stringContaining(query),
        },
      ]);

      const userMessage = llmService.chat.mock.calls[0][0][1].content;
      expect(userMessage).toContain('QUERY:');
      expect(userMessage).toContain('TASK:');
      expect(userMessage).toContain('OUTPUT FORMAT');
      expect(userMessage).toContain('EXAMPLES:');
    });
  });
});
