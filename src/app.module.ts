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
import { AppDataSource } from './data-source';

@Module({
  imports: [
    // PostgreSQL Database Configuration with TypeORM Migrations
    TypeOrmModule.forRoot({
      ...AppDataSource.options,
      migrations: [__dirname + '/migrations/*.js'], // Compiled migrations
      migrationsRun: false, // Manual migration execution
      synchronize: false, // Disable auto-sync, use migrations only
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
