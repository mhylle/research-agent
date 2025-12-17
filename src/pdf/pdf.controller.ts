import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PdfService } from './pdf.service';
import { ResearchResultService } from '../research/research-result.service';

@Controller('api/pdf')
export class PdfController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly resultService: ResearchResultService,
  ) {}

  @Get('research/:logId')
  async downloadResearchPdf(
    @Param('logId') logId: string,
    @Res() res: Response,
  ) {
    const result = await this.resultService.getByLogId(logId);
    if (!result) {
      throw new NotFoundException('Research result not found');
    }

    const buffer = await this.pdfService.generateResearchPdf({
      query: result.query,
      answer: result.answer,
      sources: result.sources || [],
      generatedAt: new Date(),
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="research-${logId}.pdf"`,
      'Content-Length': buffer.length.toString(),
    });

    res.end(buffer);
  }
}
