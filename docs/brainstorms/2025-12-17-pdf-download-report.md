# Brainstorm: PDF Download for Research Reports

**Date**: 2025-12-17
**Status**: Ready for Planning

## Executive Summary
Add a simple PDF download capability to export research results (synthesized answer + sources) from the logs view. Server-side generation using PDFKit for consistency and simplicity.

## Idea Evolution

### Original Concept
"Add the possibility of downloading the report as PDF"

### Refined Understanding
- Content: Final synthesized answer + list of sources (URL, title)
- Location: Start with logs view (session detail)
- Generation: Server-side, on-demand
- Styling: Simple text document, no branding, no knowledge graph

### Key Clarifications Made
- Sources include URL and title (relevance stored but not needed in PDF)
- Natural text flow, no pagination concerns
- Filename format: `research-{logId}.pdf`

## Analysis Results

### Strengths (Yellow Hat)
- Simple implementation with existing data structures
- PDFKit requires minimal setup (no font configuration)
- Server-side ensures consistent output across browsers
- Reusable endpoint for future integrations (email, API)

### Risks & Concerns (Black Hat + Premortem)
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Research result not found | Low | Med | Return 404 with clear message |
| Empty answer/sources | Low | Low | Check before generation, handle gracefully |
| Large PDF memory usage | Low | Low | Buffer approach fine for text-only PDFs |

### Gaps Identified
- [ ] None - straightforward feature

### Enhancement Opportunities (SCAMPER)
- **Combine**: Could later combine with email functionality
- **Modify**: Could add markdown rendering for answer formatting
- **Put to other use**: Same endpoint usable by external integrations

### Premortem Findings
- **Failure mode**: PDF blank/corrupted → **Prevention**: Validate data before generation
- **Failure mode**: Download fails silently → **Prevention**: Error toast on frontend

## Structured Concept

### Component 1: PdfModule (Backend)
**Purpose**: Generate PDF documents from research results
**Scope**: Single service + controller
**Dependencies**: PDFKit library, ResearchResultService
**Files to create**:
- `src/pdf/pdf.module.ts`
- `src/pdf/pdf.service.ts`
- `src/pdf/pdf.controller.ts`

### Component 2: Download Button (Frontend)
**Purpose**: Trigger PDF download from logs view
**Scope**: Button in session detail component
**Dependencies**: Existing logs service/components
**Files to modify**:
- Logs session detail component (add download button)

## Research Findings

### External Best Practices
- PDFKit recommended for simple text PDFs (no font config needed)
- Buffer approach preferred for small-medium PDFs
- Must set `Content-Disposition: attachment` for download
- Handle all stream events (data, end, error) to prevent leaks

### Anti-Patterns to Avoid
- Don't mix `@Header()` decorator with `@Res()` - set headers manually
- Don't forget error event handler on PDFDocument stream

### Codebase Context
- `ResearchResult` entity: `src/research/entities/research-result.entity.ts`
- Sources structure: `{ url: string, title: string, relevance: string }`
- Existing endpoint: `GET /api/research/results/:logId` (can reuse service)
- Logs detail fetches result via `GET /api/logs/sessions/:logId`

## Recommended Next Steps
1. Install PDFKit: `npm install pdfkit @types/pdfkit`
2. Create PdfModule with service and controller
3. Add download button to logs session detail view
4. Test with existing research results

## Ready for Create-Plan
**Yes**

### Suggested Plan Scope
- Create backend PDF module (service + controller)
- Add frontend download button in logs view
- Simple implementation, no branding or complex formatting
