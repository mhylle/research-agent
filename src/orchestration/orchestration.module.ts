// src/orchestration/orchestration.module.ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Orchestrator } from './orchestrator.service';
import { PlannerService } from './planner.service';
import { EventCoordinatorService } from './services/event-coordinator.service';
import { MilestoneService } from './services/milestone.service';
import { ResultExtractorService } from './services/result-extractor.service';
import { StepConfigurationService } from './services/step-configuration.service';
import { ExecutorsModule } from '../executors/executors.module';
import { LoggingModule } from '../logging/logging.module';
import { LLMModule } from '../llm/llm.module';
import { EvaluationModule } from '../evaluation/evaluation.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ExecutorsModule,
    LoggingModule,
    LLMModule,
    EvaluationModule,
  ],
  providers: [
    Orchestrator,
    PlannerService,
    EventCoordinatorService,
    MilestoneService,
    ResultExtractorService,
    StepConfigurationService,
  ],
  exports: [Orchestrator, PlannerService],
})
export class OrchestrationModule {}
