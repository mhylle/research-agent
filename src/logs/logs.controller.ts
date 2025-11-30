import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { LogsService } from './logs.service';
import { QuerySessionsDto } from './dto/query-sessions.dto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { QueryFailedError } from 'typeorm';

@Controller('api/logs')
export class LogsController {
  constructor(private logsService: LogsService) {}

  @Get('sessions')
  async getSessions(@Query() query: QuerySessionsDto) {
    return this.logsService.getAllSessions(query);
  }

  @Get('sessions/:logId')
  async getSessionDetails(@Param('logId') logId: string) {
    try {
      return await this.logsService.getSessionDetails(logId);
    } catch (error) {
      // Handle invalid UUID format (PostgreSQL error code 22P02)
      if (error instanceof QueryFailedError && (error as any).code === '22P02') {
        throw new NotFoundException(`Invalid logId format: ${logId}`);
      }
      throw error;
    }
  }

  @Get('graph/:logId')
  async getGraphData(@Param('logId') logId: string) {
    try {
      return await this.logsService.getGraphData(logId);
    } catch (error) {
      // Handle invalid UUID format (PostgreSQL error code 22P02)
      if (error instanceof QueryFailedError && (error as any).code === '22P02') {
        throw new NotFoundException(`Invalid logId format: ${logId}`);
      }
      throw error;
    }
  }

  @Get('screenshot/*path')
  async getScreenshot(
    @Param('path') filePath: string | string[],
    @Res() res: Response,
  ) {
    // Security: only allow files from data directory
    const pathStr = Array.isArray(filePath) ? filePath.join('/') : filePath;
    const fullPath = path.join(process.cwd(), pathStr);
    const dataDir = path.join(process.cwd(), 'data');

    // Ensure the path is within the data directory
    if (!fullPath.startsWith(dataDir)) {
      throw new NotFoundException('Screenshot not found');
    }

    try {
      await fs.access(fullPath);
      res.sendFile(fullPath);
    } catch (error) {
      throw new NotFoundException('Screenshot not found');
    }
  }
}
