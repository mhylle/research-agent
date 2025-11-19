import { Module } from '@nestjs/common';
import { ResearchLogger } from './research-logger.service';

@Module({
  providers: [ResearchLogger],
  exports: [ResearchLogger],
})
export class LoggingModule {}
