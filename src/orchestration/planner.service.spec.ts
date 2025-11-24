/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { PlannerService } from './planner.service';
import { OllamaService } from '../llm/ollama.service';
import { ToolExecutor } from '../executors/tool.executor';
import { LogService } from '../logging/log.service';

describe('PlannerService', () => {
  let service: PlannerService;
  let mockOllamaService: any;
  let mockToolExecutor: any;
  let mockLogService: any;

  beforeEach(async () => {
    mockOllamaService = {
      chat: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerService,
        { provide: OllamaService, useValue: mockOllamaService },
        { provide: ToolExecutor, useValue: mockToolExecutor },
        { provide: LogService, useValue: mockLogService },
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
                  arguments: { name: 'search', replanCheckpoint: true },
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
      expect(plan.phases.length).toBe(1);
      expect(plan.phases[0].name).toBe('search');
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
