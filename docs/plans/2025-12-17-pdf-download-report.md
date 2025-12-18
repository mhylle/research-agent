# Implementation Plan: PDF Download for Research Reports

## Overview
Add PDF download capability to export research results (synthesized answer + sources) from the logs view. Server-side generation using PDFKit for consistent output across browsers.

## Context
Users want to download research reports as PDF for sharing or archival. The research data already exists in `ResearchResult` entity with `query`, `answer`, and `sources` fields. We'll add a new `PdfModule` backend and a download button in the logs frontend.

**Relevant existing code**:
- `src/research/entities/research-result.entity.ts:10-58` - ResearchResult entity with sources structure
- `src/research/research-result.service.ts:86-94` - `getByLogId()` method
- `client/src/app/features/logs/logs-page/logs-page.ts` - Logs page component

## Design Decision
Server-side PDF generation with PDFKit. Simple buffer approach (not streaming) since research reports are text-only and small. Direct download via `Content-Disposition: attachment`.

## Implementation Phases

### Phase 1: Backend PDF Module

**Objective**: Create PDF generation endpoint that returns downloadable PDF for a research result.

**Tasks**:
- [x] Install PDFKit: `npm install pdfkit @types/pdfkit`
- [x] Create `src/pdf/pdf.service.ts` with `generateResearchPdf()` method
- [x] Create `src/pdf/pdf.controller.ts` with `GET /api/pdf/research/:logId` endpoint
- [x] Create `src/pdf/pdf.module.ts` and register in `AppModule`

**Files to create**:

`src/pdf/pdf.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';
import { ResearchResultModule } from '../research/research-result.module';

@Module({
  imports: [ResearchResultModule],
  controllers: [PdfController],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
```

`src/pdf/pdf.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

export interface PdfResearchData {
  query: string;
  answer: string;
  sources: Array<{ url: string; title: string; relevance: string }>;
  generatedAt: Date;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async generateResearchPdf(data: PdfResearchData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => {
          this.logger.error('PDF generation failed', err);
          reject(err);
        });

        // Title (query)
        doc.fontSize(18).text(data.query, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('gray')
          .text(`Generated: ${data.generatedAt.toLocaleString()}`, { align: 'center' });
        doc.moveDown(2);

        // Answer
        doc.fillColor('black').fontSize(12).text(data.answer, { align: 'left' });
        doc.moveDown(2);

        // Sources
        if (data.sources.length > 0) {
          doc.fontSize(14).text('Sources', { underline: true });
          doc.moveDown(0.5);

          data.sources.forEach((source, index) => {
            doc.fontSize(10)
              .fillColor('black')
              .text(`${index + 1}. ${source.title}`, { continued: false });
            doc.fontSize(9)
              .fillColor('blue')
              .text(source.url, { link: source.url, indent: 15 });
            doc.moveDown(0.3);
          });
        }

        doc.end();
      } catch (error) {
        this.logger.error('Error creating PDF document', error);
        reject(error);
      }
    });
  }
}
```

`src/pdf/pdf.controller.ts`:
```typescript
import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
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
```

**Register in AppModule** (`src/app.module.ts`):
- Add `PdfModule` to imports array

**Success Criteria**:

Automated Verification:
- [x] `npm run build` succeeds
- [x] `npm run lint` passes (no errors in PDF files)

Manual Verification:
- [ ] `curl http://localhost:3000/api/pdf/research/{logId} --output test.pdf` downloads valid PDF
- [ ] PDF contains query as title, answer as body, sources as list
- [ ] Invalid logId returns 404

---

### Phase 2: Frontend Download Button

**Objective**: Add download button to logs session detail view.

**Tasks**:
- [x] Add download button to logs session detail component
- [x] Implement download trigger using window.open or anchor download
- [ ] Add loading state during PDF generation (skipped - simple window.open approach)

**Files to modify**:

Find the logs session detail component and add:

```typescript
// In component class
downloadPdf(logId: string): void {
  window.open(`/api/pdf/research/${logId}`, '_blank');
}
```

```html
<!-- In template, near session details -->
<button
  class="download-pdf-btn"
  (click)="downloadPdf(logId)"
  title="Download as PDF">
  Download PDF
</button>
```

**Success Criteria**:

Automated Verification:
- [x] `npm run build` succeeds (both backend and frontend)
- [x] `npm run lint` passes

Manual Verification:
- [ ] Download PDF button visible in logs session detail view
- [ ] Clicking button downloads PDF file
- [ ] PDF filename is `research-{logId}.pdf`
- [ ] PDF content matches displayed research result

## Dependencies
- `pdfkit` npm package
- `@types/pdfkit` for TypeScript types

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| ResearchResultService not exported from module | Ensure `ResearchResultModule` exports the service |
| Large answers causing memory issues | Acceptable for text-only PDFs; can add streaming later if needed |
| Missing sources array | Handle with `|| []` fallback |
