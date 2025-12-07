import { Module, forwardRef } from '@nestjs/common';
import { ReasoningTraceService } from './services/reasoning-trace.service';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { LoggingModule } from '../logging/logging.module';

@Module({
  imports: [forwardRef(() => OrchestrationModule), LoggingModule],
  providers: [ReasoningTraceService],
  exports: [ReasoningTraceService],
})
export class ReasoningModule {}
