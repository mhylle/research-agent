import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { LoggingModule } from './logging/logging.module';
import { ToolsModule } from './tools/tools.module';
import { LLMModule } from './llm/llm.module';
import { ResearchModule } from './research/research.module';
import { HealthModule } from './health/health.module';
import { LogsModule } from './logs/logs.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { LogEntryEntity } from './logging/entities/log-entry.entity';
import { ResearchResultEntity } from './research/entities/research-result.entity';

@Module({
  imports: [
    // SQLite Database Configuration for Logging
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: './data/logs/research.db',
      entities: [LogEntryEntity, ResearchResultEntity],
      synchronize: true, // Auto-create tables
      logging: true, // Enable logging to debug database issues
    }),
    ServeStaticModule.forRoot({
      rootPath: join(
        __dirname,
        '..',
        '..',
        'client',
        'dist',
        'client',
        'browser',
      ),
      exclude: ['/api{*path}', '/research{*path}'],
    }),
    ConfigModule,
    LoggingModule,
    ToolsModule,
    LLMModule,
    ResearchModule,
    HealthModule,
    LogsModule,
    OrchestrationModule,
    EvaluationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
