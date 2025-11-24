import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ResearchLogger } from './research-logger.service';
import { LogService } from './log.service';
import { LogEntryEntity } from './entities/log-entry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([LogEntryEntity]),
    EventEmitterModule.forRoot(),
  ],
  providers: [ResearchLogger, LogService],
  exports: [ResearchLogger, LogService, TypeOrmModule],
})
export class LoggingModule {}
