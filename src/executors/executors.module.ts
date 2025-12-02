import { Module, OnModuleInit } from '@nestjs/common';
import { ExecutorRegistry } from './executor-registry.service';
import { ToolExecutor } from './tool.executor';
import { LLMExecutor } from './llm.executor';
import { ToolsModule } from '../tools/tools.module';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [ToolsModule, LLMModule],
  providers: [ExecutorRegistry, ToolExecutor, LLMExecutor],
  exports: [ExecutorRegistry, ToolExecutor, LLMExecutor],
})
export class ExecutorsModule implements OnModuleInit {
  constructor(
    private readonly executorRegistry: ExecutorRegistry,
    private readonly toolExecutor: ToolExecutor,
    private readonly llmExecutor: LLMExecutor,
  ) {}

  onModuleInit() {
    // Register tool executors
    this.executorRegistry.register('tavily_search', this.toolExecutor);
    this.executorRegistry.register('web_fetch', this.toolExecutor);
    this.executorRegistry.register('duckduckgo_search', this.toolExecutor);
    this.executorRegistry.register('brave_search', this.toolExecutor);
    this.executorRegistry.register('serpapi_search', this.toolExecutor);
    this.executorRegistry.register('knowledge_search', this.toolExecutor);

    // Register LLM executors (all variations the LLM might generate)
    this.executorRegistry.register('synthesize', this.llmExecutor);
    this.executorRegistry.register('synthesis', this.llmExecutor);
    this.executorRegistry.register('text_synthesis', this.llmExecutor);
    this.executorRegistry.register('tavily_synthesize', this.llmExecutor);
  }
}
