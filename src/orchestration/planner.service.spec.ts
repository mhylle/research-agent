/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { PlannerService } from './planner.service';
import { OllamaService } from '../llm/ollama.service';
import { ToolExecutor } from '../executors/tool.executor';
import { LogService } from '../logging/log.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('PlannerService', () => {
  let service: PlannerService;
  let mockOllamaService: any;
  let mockToolExecutor: any;
  let mockLogService: any;
  let mockEventEmitter: any;

  beforeEach(async () => {
    mockOllamaService = {
      chat: jest.fn().mockResolvedValue({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [],
        },
      }),
    };

    mockToolExecutor = {
      getAvailableTools: jest.fn().mockReturnValue([
        {
          type: 'function',
          function: { name: 'tavily_search', description: 'Search' },
        },
      ]),
    };

    mockLogService = {
      append: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerService,
        { provide: OllamaService, useValue: mockOllamaService },
        { provide: ToolExecutor, useValue: mockToolExecutor },
        { provide: LogService, useValue: mockLogService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<PlannerService>(PlannerService);
  });

  describe('createPlan', () => {
    it('should create a plan through iterative tool calls', async () => {
      mockOllamaService.chat
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'create_plan',
                  arguments: { query: 'test', name: 'Test Plan' },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'add_phase',
                  arguments: { name: 'search', description: 'Search phase', replanCheckpoint: true },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'add_step',
                  arguments: { phaseId: expect.any(String), toolName: 'tavily_search', type: 'search', config: {} },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              { function: { name: 'finalize_plan', arguments: {} } },
            ],
          },
        });

      const plan = await service.createPlan('test query', 'log-123');

      expect(plan).toBeDefined();
      expect(plan.query).toBe('test');
      // Should have 2 phases: the search phase + auto-added synthesis phase
      expect(plan.phases.length).toBe(2);
      expect(plan.phases[0].name).toBe('search');
      expect(plan.phases[1].name).toBe('Synthesis & Answer Generation');
      expect(plan.phases[1].steps.length).toBe(1);
      expect(plan.phases[1].steps[0].toolName).toBe('synthesize');
    });

    it('should auto-add synthesis phase when plan lacks one', async () => {
      mockOllamaService.chat
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'create_plan',
                  arguments: { query: 'test query', name: 'Test Plan' },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'add_phase',
                  arguments: { name: 'Information Gathering', description: 'Search for info', replanCheckpoint: false },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'add_step',
                  arguments: { phaseId: expect.any(String), toolName: 'tavily_search', type: 'search', config: { query: 'test' } },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              { function: { name: 'finalize_plan', arguments: {} } },
            ],
          },
        });

      const plan = await service.createPlan('test query', 'log-123');

      // Verify synthesis phase was auto-added
      expect(plan.phases.length).toBe(2);
      const synthesisPhase = plan.phases[1];
      expect(synthesisPhase.name).toBe('Synthesis & Answer Generation');
      expect(synthesisPhase.steps.length).toBe(1);
      expect(synthesisPhase.steps[0].toolName).toBe('synthesize');
      expect(synthesisPhase.steps[0].type).toBe('llm');

      // Verify the synthesis step has proper config
      expect(synthesisPhase.steps[0].config).toHaveProperty('systemPrompt');
      expect(synthesisPhase.steps[0].config).toHaveProperty('prompt');
      expect(synthesisPhase.steps[0].config.prompt).toContain('test query');
    });

    it('should NOT auto-add synthesis phase when plan already has one', async () => {
      mockOllamaService.chat
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'create_plan',
                  arguments: { query: 'test query', name: 'Test Plan' },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'add_phase',
                  arguments: { name: 'Search Phase', description: 'Search', replanCheckpoint: false },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'add_step',
                  arguments: { phaseId: expect.any(String), toolName: 'tavily_search', type: 'search', config: {} },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'add_phase',
                  arguments: { name: 'Synthesis Phase', description: 'Synthesize results', replanCheckpoint: false },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'add_step',
                  arguments: { phaseId: expect.any(String), toolName: 'synthesize', type: 'llm', config: {} },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              { function: { name: 'finalize_plan', arguments: {} } },
            ],
          },
        });

      const plan = await service.createPlan('test query', 'log-123');

      // Verify NO auto-added synthesis phase (should have exactly 2 phases)
      expect(plan.phases.length).toBe(2);
      expect(plan.phases[0].name).toBe('Search Phase');
      expect(plan.phases[1].name).toBe('Synthesis Phase');
    });
  });

  describe('decideRecovery', () => {
    it('should return retry action when retry_step is called', async () => {
      mockOllamaService.chat.mockResolvedValueOnce({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: 'retry_step',
                arguments: { stepId: 'step-1', reason: 'Transient error' },
              },
            },
          ],
        },
      });

      const context = {
        planSummary: 'Test plan',
        failedPhase: 'search',
        failedStep: {
          stepId: 'step-1',
          toolName: 'tavily_search',
          config: {},
          error: { message: 'Network error' },
        },
        completedSteps: [],
        remainingPhases: ['fetch', 'synthesize'],
      };

      const decision = await service.decideRecovery(context, 'log-123');

      expect(decision.action).toBe('retry');
      expect(decision.reason).toBe('Transient error');
    });
  });
});
