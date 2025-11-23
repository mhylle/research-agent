import { Controller, Get, Param, Query, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { LogsService } from './logs.service';
import { QuerySessionsDto } from './dto/query-sessions.dto';
import * as fs from 'fs/promises';
import * as path from 'path';

@Controller('api/logs')
export class LogsController {
  constructor(private logsService: LogsService) {}

  @Get('sessions')
  async getSessions(@Query() query: QuerySessionsDto) {
    return this.logsService.getAllSessions(query);
  }

  @Get('sessions/:logId')
  async getSessionDetails(@Param('logId') logId: string) {
    return this.logsService.getSessionDetails(logId);
  }

  @Get('graph/:logId')
  async getGraphData(@Param('logId') logId: string) {
    return this.logsService.getGraphData(logId);
  }

  @Get('screenshot/*path')
  async getScreenshot(@Param('path') filePath: string | string[], @Res() res: Response) {
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
