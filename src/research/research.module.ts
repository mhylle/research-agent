import { Module } from '@nestjs/common';
import { ResearchService } from './research.service';
import { ResearchController } from './research.controller';
import { ResearchStreamController } from './research-stream.controller';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { LoggingModule } from '../logging/logging.module';

@Module({
  imports: [OrchestrationModule, LoggingModule],
  controllers: [ResearchController, ResearchStreamController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}
