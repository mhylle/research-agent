import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchService } from './research.service';
import { ResearchController } from './research.controller';
import { ResearchStreamController } from './research-stream.controller';
import { ResearchResultController } from './research-result.controller';
import { ResearchResultService } from './research-result.service';
import { ResearchResultEntity } from './entities/research-result.entity';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { LoggingModule } from '../logging/logging.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResearchResultEntity]),
    OrchestrationModule,
    LoggingModule,
  ],
  controllers: [
    ResearchController,
    ResearchStreamController,
    ResearchResultController,
  ],
  providers: [ResearchService, ResearchResultService],
  exports: [ResearchService, ResearchResultService],
})
export class ResearchModule {}
