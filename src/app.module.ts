import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { LoggingModule } from './logging/logging.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [ConfigModule, LoggingModule, ToolsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
