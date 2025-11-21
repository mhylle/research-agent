import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client'),
      exclude: ['/api*'],
    }),
    ConfigModule,
    LoggingModule,
    ToolsModule,
    LLMModule,
    ResearchModule,
    HealthModule,
    LogsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
