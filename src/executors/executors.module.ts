import { Module } from '@nestjs/common';
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
export class ExecutorsModule {}
