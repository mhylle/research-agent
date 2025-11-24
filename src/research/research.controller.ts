import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ResearchService } from './research.service';
import { ResearchQueryDto } from './dto/research-query.dto';
import { ResearchResponseDto } from './dto/research-response.dto';

@Controller('api/research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Post('query')
  async query(
    @Body(new ValidationPipe({ transform: true })) dto: ResearchQueryDto,
  ): Promise<ResearchResponseDto> {
    return this.researchService.executeResearch(dto.query, dto);
  }

  @Post('retry/:logId/:nodeId')
  async retryTask(
    @Param('logId') logId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.researchService.retryNode(logId, nodeId);
      return {
        success: true,
        message: 'Retry initiated successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to retry task',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
