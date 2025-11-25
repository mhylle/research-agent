import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { LogEntryEntity } from '../logging/entities/log-entry.entity';
import { ResearchResultEntity } from '../research/entities/research-result.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LogEntryEntity, ResearchResultEntity])],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
