import { Controller, Get, Param, Query } from '@nestjs/common';
import { LogsService } from './logs.service';
import { QuerySessionsDto } from './dto/query-sessions.dto';

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
}
