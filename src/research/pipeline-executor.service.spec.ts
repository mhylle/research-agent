import { Test, TestingModule } from '@nestjs/testing';
import { PipelineExecutor } from './pipeline-executor.service';
import { OllamaService } from '../llm/ollama.service';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { ResearchLogger } from '../logging/research-logger.service';

describe('PipelineExecutor', () => {
  let executor: PipelineExecutor;
  let ollamaService: jest.Mocked<OllamaService>;
  let toolRegistry: jest.Mocked<ToolRegistry>;
  let logger: jest.Mocked<ResearchLogger>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineExecutor,
        {
          provide: OllamaService,
          useValue: {
            chat: jest.fn(),
          },
        },
        {
          provide: ToolRegistry,
          useValue: {
            execute: jest.fn(),
          },
        },
        {
          provide: ResearchLogger,
          useValue: {
            logStageInput: jest.fn(),
            logStageOutput: jest.fn(),
            logStageError: jest.fn(),
            logToolExecution: jest.fn(),
          },
        },
      ],
    }).compile();

    executor = module.get<PipelineExecutor>(PipelineExecutor);
    ollamaService = module.get(OllamaService);
    toolRegistry = module.get(ToolRegistry);
    logger = module.get(ResearchLogger);
  });

  it('should be defined', () => {
    expect(executor).toBeDefined();
  });

  it('should execute a stage', async () => {
    const mockResponse = {
      message: { role: 'assistant', content: 'Response' },
    };
    ollamaService.chat.mockResolvedValue(mockResponse as any);

    const context = {
      stageNumber: 1 as const,
      messages: [{ role: 'user' as const, content: 'Test' }],
      tools: [],
      systemPrompt: 'System prompt',
      logId: 'test-log-id',
    };

    const result = await executor.executeStage(context);

    expect(result.message.content).toBe('Response');
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
    expect(logger.logStageInput).toHaveBeenCalled();
    expect(logger.logStageOutput).toHaveBeenCalled();
  });

  it('should execute tool calls', async () => {
    const mockToolResult = { results: ['result1'] };
    toolRegistry.execute.mockResolvedValue(mockToolResult);

    const toolCalls = [
      { function: { name: 'test_tool', arguments: { query: 'test' } } },
    ];

    const results = await executor.executeToolCalls(toolCalls, 'test-log-id');

    expect(results).toHaveLength(1);
    expect(toolRegistry.execute).toHaveBeenCalledWith('test_tool', {
      query: 'test',
    });
    expect(logger.logToolExecution).toHaveBeenCalled();
  });

  it('should retry on failure with exponential backoff', async () => {
    ollamaService.chat
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({
        message: { role: 'assistant', content: 'Success' },
      } as any);

    const context = {
      stageNumber: 1 as const,
      messages: [{ role: 'user' as const, content: 'Test' }],
      tools: [],
      systemPrompt: 'Test',
      logId: 'test-id',
    };

    const result = await executor.executeStage(context);

    expect(result.message.content).toBe('Success');
    expect(ollamaService.chat).toHaveBeenCalledTimes(2);
  });

  it('should fail after max retries', async () => {
    ollamaService.chat.mockRejectedValue(new Error('Persistent failure'));

    const context = {
      stageNumber: 1 as const,
      messages: [{ role: 'user' as const, content: 'Test' }],
      tools: [],
      systemPrompt: 'Test',
      logId: 'test-id',
    };

    await expect(executor.executeStage(context)).rejects.toThrow(
      'Persistent failure',
    );
    expect(ollamaService.chat).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should retry tool calls on failure', async () => {
    toolRegistry.execute
      .mockRejectedValueOnce(new Error('Temporary tool failure'))
      .mockResolvedValueOnce({ result: 'success' });

    const toolCalls = [
      { function: { name: 'test_tool', arguments: { query: 'test' } } },
    ];

    const results = await executor.executeToolCalls(toolCalls, 'test-log-id');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ result: 'success' });
    expect(toolRegistry.execute).toHaveBeenCalledTimes(2);
  });
});
