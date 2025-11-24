import { Test, TestingModule } from '@nestjs/testing';
import { ToolExecutor } from './tool.executor';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolExecutor,
        {
          provide: ToolRegistry,
          useValue: {
            execute: jest.fn().mockResolvedValue({ results: ['test'] }),
            getDefinitions: jest
              .fn()
              .mockReturnValue([
                { function: { name: 'tavily_search', description: 'Search' } },
              ]),
          },
        },
      ],
    }).compile();

    executor = module.get<ToolExecutor>(ToolExecutor);
    mockToolRegistry = module.get(ToolRegistry);
  });

  describe('execute', () => {
    it('should execute tool and return result', async () => {
      const step: PlanStep = {
        id: 'step-1',
        phaseId: 'phase-1',
        type: 'tool_call',
        toolName: 'tavily_search',
        config: { query: 'test query' },
        dependencies: [],
        status: 'pending',
        order: 0,
      };

      const result = await executor.execute(step);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockToolRegistry.execute).toHaveBeenCalledWith('tavily_search', {
        query: 'test query',
      });
      expect(result.output).toEqual({ results: ['test'] });
      expect(result.metadata?.toolName).toBe('tavily_search');
    });

    it('should capture error on tool failure', async () => {
      mockToolRegistry.execute.mockRejectedValue(new Error('Tool failed'));

      const step: PlanStep = {
        id: 'step-1',
        phaseId: 'phase-1',
        type: 'tool_call',
        toolName: 'tavily_search',
        config: { query: 'test query' },
        dependencies: [],
        status: 'pending',
        order: 0,
      };

      const result = await executor.execute(step);

      expect(result.error).toBeDefined();
      if (result.error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.error.message).toBe('Tool failed');
      }
    });
  });

  describe('getAvailableTools', () => {
    it('should return all tool definitions', () => {
      const tools = executor.getAvailableTools();

      expect(tools).toEqual([
        { function: { name: 'tavily_search', description: 'Search' } },
      ]);
    });
  });
});
