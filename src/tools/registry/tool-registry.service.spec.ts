import { Test, TestingModule } from '@nestjs/testing';
import { ToolRegistry } from './tool-registry.service';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const mockTool: ITool = {
    definition: {
      type: 'function',
      function: {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          required: ['input'],
          properties: {
            input: { type: 'string', description: 'Test input' }
          }
        }
      }
    },
    execute: jest.fn().mockResolvedValue({ result: 'test' })
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolRegistry],
    }).compile();

    registry = module.get<ToolRegistry>(ToolRegistry);
  });

  it('should be defined', () => {
    expect(registry).toBeDefined();
  });

  it('should register a tool', () => {
    registry.register(mockTool);
    const definitions = registry.getDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0].function.name).toBe('test_tool');
  });

  it('should execute a registered tool', async () => {
    registry.register(mockTool);
    const result = await registry.execute('test_tool', { input: 'test' });
    expect(result).toEqual({ result: 'test' });
    expect(mockTool.execute).toHaveBeenCalledWith({ input: 'test' });
  });

  it('should throw error for unregistered tool', async () => {
    await expect(
      registry.execute('unknown_tool', {})
    ).rejects.toThrow('Tool not found: unknown_tool');
  });
});
