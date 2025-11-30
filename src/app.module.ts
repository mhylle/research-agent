import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
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
import { EvaluationRecordEntity } from './evaluation/entities/evaluation-record.entity';

@Module({
  imports: [
    // PostgreSQL Database Configuration
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: configService.getOrThrow<number>('DB_PORT'),
        username: configService.getOrThrow<string>('DB_USERNAME'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_DATABASE'),
        entities: [LogEntryEntity, ResearchResultEntity, EvaluationRecordEntity],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
      }),
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
