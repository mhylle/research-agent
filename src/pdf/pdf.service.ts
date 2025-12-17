import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';
import { marked } from 'marked';

export interface PdfResearchData {
  query: string;
  answer: string;
  sources: Array<{ url: string; title: string; relevance: string }>;
  generatedAt: Date;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor() {
    // Configure marked options to match frontend
    marked.use({
      gfm: true,
      breaks: true,
    });
  }

  async generateResearchPdf(data: PdfResearchData): Promise<Buffer> {
    const html = this.generateHtml(data);

    let browser: Browser | undefined;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '40px',
          right: '40px',
          bottom: '40px',
          left: '40px',
        },
        printBackground: true,
      });

      return Buffer.from(pdfBuffer);
    } catch (error) {
      this.logger.error('PDF generation failed', error);
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private generateHtml(data: PdfResearchData): string {
    const answerHtml = marked.parse(data.answer) as string;

    const sourcesHtml =
      data.sources.length > 0
        ? `
      <div class="sources">
        <h3>Sources</h3>
        <ul>
          ${data.sources
            .map(
              (source, index) => `
            <li>
              <span class="source-number">${index + 1}.</span>
              <a href="${source.url}" target="_blank">${source.title}</a>
              <span class="relevance">(${source.relevance})</span>
            </li>
          `,
            )
            .join('')}
        </ul>
      </div>
    `
        : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* Digital Hygge Design System - PDF Styles */

    /* Variables */
    :root {
      --oatmeal: #f5f5f4;
      --stone: #e7e5e4;
      --stone-300: #d6d3d1;
      --charcoal: #292524;
      --charcoal-light: #44403c;
      --moss: #4d7c0f;
      --moss-light: #65a30d;
      --moss-bg: #ecfccb;
      --clay: #ea580c;
      --slate: #64748b;
      --slate-light: #94a3b8;
      --warning-bg: #ffedd5;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      color: var(--charcoal);
      background: white;
    }

    .container {
      max-width: 100%;
      padding: 0;
    }

    /* Header */
    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--moss);
    }

    .query {
      font-family: 'Georgia', serif;
      font-size: 18pt;
      font-weight: 600;
      color: var(--charcoal);
      margin-bottom: 8px;
      line-height: 1.3;
    }

    .meta {
      font-size: 10pt;
      color: var(--slate);
    }

    /* Answer Section */
    .answer {
      margin-bottom: 32px;
    }

    .answer-label {
      font-family: 'Georgia', serif;
      font-size: 14pt;
      font-weight: 600;
      color: var(--moss);
      margin-bottom: 16px;
      padding: 8px 16px;
      background: var(--moss-bg);
      border-radius: 8px;
    }

    /* Markdown Content Styles */
    .markdown-content {
      font-size: 11pt;
      line-height: 1.8;
      color: var(--charcoal);
    }

    .markdown-content h1,
    .markdown-content h2,
    .markdown-content h3,
    .markdown-content h4,
    .markdown-content h5,
    .markdown-content h6 {
      font-family: 'Georgia', serif;
      font-weight: 600;
      color: var(--charcoal);
      margin-top: 1.5em;
      margin-bottom: 0.75em;
      line-height: 1.3;
    }

    .markdown-content h1:first-child,
    .markdown-content h2:first-child,
    .markdown-content h3:first-child {
      margin-top: 0;
    }

    .markdown-content h1 {
      font-size: 16pt;
      border-bottom: 1px solid var(--stone-300);
      padding-bottom: 0.5em;
    }

    .markdown-content h2 {
      font-size: 14pt;
      border-bottom: 1px solid var(--stone-300);
      padding-bottom: 0.3em;
    }

    .markdown-content h3 {
      font-size: 12pt;
    }

    .markdown-content p {
      margin-top: 0;
      margin-bottom: 1em;
    }

    .markdown-content p:last-child {
      margin-bottom: 0;
    }

    .markdown-content ul,
    .markdown-content ol {
      padding-left: 1.5em;
      margin-top: 0;
      margin-bottom: 1em;
    }

    .markdown-content li {
      margin-bottom: 0.25em;
    }

    .markdown-content ul {
      list-style-type: disc;
    }

    .markdown-content ul ul {
      list-style-type: circle;
    }

    .markdown-content ol {
      list-style-type: decimal;
    }

    .markdown-content code {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9em;
      background-color: var(--stone);
      padding: 0.15em 0.4em;
      border-radius: 4px;
      color: var(--clay);
    }

    .markdown-content pre {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 10pt;
      background-color: var(--stone);
      border-radius: 8px;
      padding: 16px;
      margin: 1em 0;
      overflow-x: auto;
      line-height: 1.5;
    }

    .markdown-content pre code {
      background: none;
      padding: 0;
      color: inherit;
    }

    .markdown-content blockquote {
      border-left: 4px solid var(--moss);
      margin: 1em 0;
      padding: 0.5em 0 0.5em 1em;
      color: var(--slate);
      background-color: var(--stone);
      border-radius: 0 8px 8px 0;
    }

    .markdown-content a {
      color: var(--moss);
      text-decoration: none;
    }

    .markdown-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      font-size: 10pt;
    }

    .markdown-content th,
    .markdown-content td {
      padding: 0.75em;
      text-align: left;
      border: 1px solid var(--stone-300);
    }

    .markdown-content th {
      background-color: var(--stone);
      font-weight: 600;
    }

    .markdown-content tr:nth-child(even) {
      background-color: var(--oatmeal);
    }

    .markdown-content strong {
      font-weight: 600;
      color: var(--charcoal);
    }

    .markdown-content em {
      font-style: italic;
    }

    .markdown-content hr {
      border: none;
      height: 1px;
      background-color: var(--stone-300);
      margin: 2em 0;
    }

    /* Sources Section */
    .sources {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--stone-300);
    }

    .sources h3 {
      font-family: 'Georgia', serif;
      font-size: 12pt;
      font-weight: 600;
      color: var(--slate);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }

    .sources ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .sources li {
      padding: 8px 0;
      font-size: 10pt;
      border-bottom: 1px solid var(--oatmeal);
    }

    .sources li:last-child {
      border-bottom: none;
    }

    .sources .source-number {
      color: var(--slate);
      margin-right: 8px;
    }

    .sources a {
      color: var(--moss);
      text-decoration: none;
    }

    .sources .relevance {
      color: var(--slate-light);
      font-size: 9pt;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="query">${this.escapeHtml(data.query)}</h1>
      <div class="meta">Generated: ${data.generatedAt.toLocaleString()}</div>
    </div>

    <div class="answer">
      <div class="answer-label">Research Answer</div>
      <div class="markdown-content">
        ${answerHtml}
      </div>
    </div>

    ${sourcesHtml}
  </div>
</body>
</html>
    `;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
