import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [LLMModule],
  controllers: [HealthController],
})
export class HealthModule {}
