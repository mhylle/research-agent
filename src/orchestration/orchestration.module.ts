// src/orchestration/orchestration.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Orchestrator } from './orchestrator.service';
import { PlannerService } from './planner.service';
import { EventCoordinatorService } from './services/event-coordinator.service';
import { MilestoneService } from './services/milestone.service';
import { ResultExtractorService } from './services/result-extractor.service';
import { StepConfigurationService } from './services/step-configuration.service';
import { EvaluationCoordinatorService } from './services/evaluation-coordinator.service';
import { WorkingMemoryService } from './services/working-memory.service';
import { QueryDecomposerService } from './services/query-decomposer.service';
import { CoverageAnalyzerService } from './services/coverage-analyzer.service';
import { ExecutorsModule } from '../executors/executors.module';
import { LoggingModule } from '../logging/logging.module';
import { LLMModule } from '../llm/llm.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { ReasoningModule } from '../reasoning/reasoning.module';
import { ReflectionModule } from '../reflection/reflection.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ResearchResultEntity } from '../research/entities/research-result.entity';
import { ResearchResultService } from '../research/research-result.service';
import { PhaseExecutorRegistry } from './phase-executors/phase-executor-registry';
import { SearchPhaseExecutor } from './phase-executors/search-phase-executor';
import { FetchPhaseExecutor } from './phase-executors/fetch-phase-executor';
import { SynthesisPhaseExecutor } from './phase-executors/synthesis-phase-executor';
import { GenericPhaseExecutor } from './phase-executors/generic-phase-executor';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([ResearchResultEntity]),
    ExecutorsModule,
    LoggingModule,
    LLMModule,
    EvaluationModule,
    KnowledgeModule,
    forwardRef(() => ReasoningModule),
    forwardRef(() => ReflectionModule),
  ],
  providers: [
    Orchestrator,
    PlannerService,
    EventCoordinatorService,
    MilestoneService,
    ResultExtractorService,
    StepConfigurationService,
    EvaluationCoordinatorService,
    WorkingMemoryService,
    QueryDecomposerService,
    CoverageAnalyzerService,
    ResearchResultService,
    // Phase executors
    PhaseExecutorRegistry,
    SearchPhaseExecutor,
    FetchPhaseExecutor,
    SynthesisPhaseExecutor,
    GenericPhaseExecutor,
  ],
  exports: [
    Orchestrator,
    PlannerService,
    EventCoordinatorService,
    WorkingMemoryService,
    QueryDecomposerService,
    CoverageAnalyzerService,
  ],
})
export class OrchestrationModule {}
