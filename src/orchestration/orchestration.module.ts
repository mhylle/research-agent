// src/orchestration/orchestration.module.ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Orchestrator } from './orchestrator.service';
import { PlannerService } from './planner.service';
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
  providers: [Orchestrator, PlannerService],
  exports: [Orchestrator, PlannerService],
})
export class OrchestrationModule {}
