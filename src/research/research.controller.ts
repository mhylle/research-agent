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
    return this.researchService.executeResearch(dto.query) as any;
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
