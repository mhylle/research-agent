import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ResearchService } from './research.service';
import { ResearchQueryDto } from './dto/research-query.dto';

@Controller('api/research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Post('query')
  async query(
    @Body(new ValidationPipe({ transform: true })) dto: ResearchQueryDto,
  ): Promise<{ logId: string }> {
    // Generate logId immediately so frontend can connect to SSE
    const logId = randomUUID();

    // Start research in background (don't block)
    this.researchService.startResearchInBackground(dto.query, logId);

    // Return logId immediately for SSE connection
    return { logId };
  }

  @Post('retry/:logId/:nodeId')
  async retryTask(
    @Param('logId') logId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<{ success: boolean; message: string }> {
    throw new HttpException(
      'Retry functionality not yet implemented',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
