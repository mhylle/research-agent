import { Module } from '@nestjs/common';
import { ResearchController } from './research.controller';
import { ResearchStreamController } from './research-stream.controller';
import { ResearchService } from './research.service';
import { PipelineExecutor } from './pipeline-executor.service';
import { LLMModule } from '../llm/llm.module';
import { ToolsModule } from '../tools/tools.module';
import { LoggingModule } from '../logging/logging.module';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [LLMModule, ToolsModule, LoggingModule, LogsModule],
  controllers: [ResearchController, ResearchStreamController],
  providers: [ResearchService, PipelineExecutor],
})
export class ResearchModule {}
