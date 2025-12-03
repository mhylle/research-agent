import { Module, forwardRef } from '@nestjs/common';
import { LLMModule } from '../llm/llm.module';
import { LoggingModule } from '../logging/logging.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { ReflectionService } from './services/reflection.service';
import { GapDetectorService } from './services/gap-detector.service';
import { SelfCritiqueEngineService } from './services/self-critique-engine.service';
import { RefinementEngineService } from './services/refinement-engine.service';

@Module({
  imports: [LLMModule, LoggingModule, EvaluationModule, forwardRef(() => OrchestrationModule)],
  providers: [
    ReflectionService,
    GapDetectorService,
    SelfCritiqueEngineService,
    RefinementEngineService,
  ],
  exports: [
    ReflectionService,
    GapDetectorService,
    SelfCritiqueEngineService,
    RefinementEngineService,
  ],
})
export class ReflectionModule {}
