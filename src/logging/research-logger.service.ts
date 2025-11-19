import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ResearchLogger {
  private logger: winston.Logger;

  constructor(private configService: ConfigService) {
    const logDir = this.configService.get<string>('LOG_DIR');

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: this.configService.get<string>('LOG_LEVEL'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(logDir, 'research-error.log'),
          level: 'error',
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'research-combined.log'),
        }),
      ],
    });

    // Add console transport in non-production
    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.add(
        new winston.transports.Console({
          format: winston.format.simple(),
        })
      );
    }
  }

  logStageInput(stage: number, logId: string, input: any) {
    this.logger.info('Stage input', {
      logId,
      stage,
      component: 'pipeline',
      operation: 'stage_input',
      input: this.sanitize(input),
      timestamp: new Date().toISOString(),
    });
  }

  logStageOutput(stage: number, logId: string, output: any, executionTime: number) {
    this.logger.info('Stage output', {
      logId,
      stage,
      component: 'pipeline',
      operation: 'stage_output',
      output: this.sanitize(output),
      executionTime,
      timestamp: new Date().toISOString(),
    });
  }

  logToolExecution(
    logId: string,
    toolName: string,
    args: any,
    result: any,
    executionTime: number
  ) {
    this.logger.info('Tool executed', {
      logId,
      component: toolName,
      operation: 'execute',
      input: this.sanitize(args),
      output: this.sanitize(result),
      executionTime,
      timestamp: new Date().toISOString(),
    });
  }

  logStageError(stage: number, logId: string, error: any) {
    this.logger.error('Stage error', {
      logId,
      stage,
      component: 'pipeline',
      operation: 'stage_error',
      metadata: { error: error.message },
      timestamp: new Date().toISOString(),
    });
  }

  private sanitize(data: any): any {
    const str = JSON.stringify(data);
    if (str.length > 1000) {
      return str.substring(0, 1000) + '...';
    }
    return data;
  }
}
