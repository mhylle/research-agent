import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ResearchResultService } from './research-result.service';
import { ResearchResultEntity } from './entities/research-result.entity';
import { KnowledgeSearchService } from '../knowledge/knowledge-search.service';

@Controller('api/research/results')
export class ResearchResultController {
  constructor(
    private readonly resultService: ResearchResultService,
    private readonly knowledgeSearchService: KnowledgeSearchService,
  ) {}

  @Get()
  async findAll(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<{ results: ResearchResultEntity[]; total: number }> {
    return this.resultService.findAll({ limit, offset });
  }

  @Get('embeddings/stats')
  async getEmbeddingStats(): Promise<{
    totalResults: number;
    withEmbeddings: number;
    withoutEmbeddings: number;
  }> {
    const { total } = await this.resultService.findAll({ limit: 1, offset: 0 });
    const withEmbeddings = await this.knowledgeSearchService.getEmbeddedCount();
    return {
      totalResults: total,
      withEmbeddings,
      withoutEmbeddings: total - withEmbeddings,
    };
  }

  @Post('embeddings/backfill')
  async backfillEmbeddings(): Promise<{ processed: number; failed: number }> {
    return this.resultService.backfillEmbeddings();
  }

  @Get(':logId')
  async findByLogId(
    @Param('logId') logId: string,
  ): Promise<ResearchResultEntity> {
    return this.resultService.getByLogId(logId);
  }
}
