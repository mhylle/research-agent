import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ResearchResultService } from './research-result.service';
import { ResearchResultEntity } from './entities/research-result.entity';

@Controller('api/research/results')
export class ResearchResultController {
  constructor(private readonly resultService: ResearchResultService) {}

  @Get()
  async findAll(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<{ results: ResearchResultEntity[]; total: number }> {
    return this.resultService.findAll({ limit, offset });
  }

  @Get(':logId')
  async findByLogId(@Param('logId') logId: string): Promise<ResearchResultEntity> {
    return this.resultService.getByLogId(logId);
  }
}
