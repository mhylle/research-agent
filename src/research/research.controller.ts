import { Controller, Post, Body, ValidationPipe } from '@nestjs/common';
import { ResearchService } from './research.service';
import { ResearchQueryDto } from './dto/research-query.dto';
import { ResearchResponseDto } from './dto/research-response.dto';

@Controller('api/research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Post('query')
  async query(
    @Body(new ValidationPipe({ transform: true })) dto: ResearchQueryDto
  ): Promise<ResearchResponseDto> {
    return this.researchService.executeResearch(dto.query, dto);
  }
}
