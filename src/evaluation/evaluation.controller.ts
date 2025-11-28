import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { EvaluationService } from './services/evaluation.service';

@Controller('api/evaluation')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'evaluation' };
  }

  @Get('records')
  async getRecords(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('passed') passed?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const passedFilter =
      passed === 'true' ? true : passed === 'false' ? false : undefined;

    return this.evaluationService.getRecords(pageNum, limitNum, passedFilter);
  }

  @Get('stats')
  async getStats() {
    return this.evaluationService.getStats();
  }

  @Get('records/:id')
  async getRecordById(@Param('id') id: string) {
    const record = await this.evaluationService.getRecordById(id);
    if (!record) {
      throw new NotFoundException(`Evaluation record ${id} not found`);
    }
    return record;
  }
}
