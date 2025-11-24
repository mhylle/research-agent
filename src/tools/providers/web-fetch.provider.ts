import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { chromium } from 'playwright';
import { Ollama } from 'ollama';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { WebFetchArgs } from './interfaces/web-fetch-args.interface';

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  htmlPath?: string;
  screenshotPath?: string;
  originalSize?: number;
  extractionMethod?: string;
  extractionMetadata?: {
    downloadDuration?: number;
    readability?: {
      attempted: boolean;
      success: boolean;
      confidence: number;
      duration: number;
      contentLength: number;
    };
    vision?: {
      attempted: boolean;
      success: boolean;
      confidence: number;
      duration: number;
      model: string;
      promptLength: number;
      responseLength: number;
      screenshotSize?: number;
    };
    cheerio?: {
      attempted: boolean;
      success: boolean;
      duration: number;
      contentLength: number;
    };
    selectionReason: string;
    totalDuration: number;
  };
}

interface ExtractionResult {
  success: boolean;
  method: 'readability' | 'vision' | 'cheerio';
  confidence: number;
  title: string;
  content: string;
  fullContent?: string;
  excerpt?: string;
  byline?: string;
  length?: number;
  visualElements?: Array<{
    type: string;
    description: string;
  }>;
}

@Injectable()
export class WebFetchProvider implements ITool {
  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and extract text content from a URL',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch content from',
          },
        },
      },
    },
  };

  private readonly timeout: number;
  private readonly maxSize: number;
  private readonly storageDir: string;
  private readonly screenshotsEnabled: boolean;
  private readonly screenshotTimeout: number;
  private readonly alwaysScreenshot: boolean;
  private readonly visionEnabled: boolean;
  private readonly visionModel: string;
  private readonly visionThreshold: number;
  private readonly ollama: Ollama;
  private readonly logger = new Logger('WebFetchProvider');

  constructor(private configService: ConfigService) {
    this.timeout = this.configService.get<number>('WEB_FETCH_TIMEOUT') || 30000;
    this.maxSize =
      this.configService.get<number>('WEB_FETCH_MAX_SIZE') || 104857600; // 100MB
    this.storageDir =
      this.configService.get<string>('WEB_FETCH_STORAGE_DIR') ||
      './data/fetched-content';
    this.screenshotsEnabled =
      this.configService.get<boolean>('ENABLE_SCREENSHOTS') || false;
    this.screenshotTimeout =
      this.configService.get<number>('SCREENSHOT_TIMEOUT') || 15000;
    this.alwaysScreenshot =
      this.configService.get<boolean>('ALWAYS_SCREENSHOT') || false;
    this.visionEnabled =
      this.configService.get<boolean>('VISION_LLM_ENABLED') || false;
    this.visionModel =
      this.configService.get<string>('VISION_LLM_MODEL') || 'llava';
    this.visionThreshold = parseFloat(
      this.configService.get<string>('VISION_THRESHOLD') || '0.7',
    );

    // Initialize Ollama client
    const ollamaBaseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://localhost:11434';
    this.ollama = new Ollama({ host: ollamaBaseUrl });

    this.logger.log(
      `WebFetch initialized: screenshots=${this.screenshotsEnabled}, alwaysScreenshot=${this.alwaysScreenshot}, vision=${this.visionEnabled}, visionThreshold=${this.visionThreshold}, model=${this.visionModel}`,
    );
  }

  /**
   * Generate MD5 hash for URL to use as filename
   */
  private hashUrl(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDir(logId: string): Promise<string> {
    const logDir = path.join(this.storageDir, logId);
    await fs.mkdir(logDir, { recursive: true });
    return logDir;
  }

  /**
   * Save complete HTML to disk
   */
  private async saveHtml(
    html: string,
    logId: string,
    urlHash: string,
  ): Promise<string> {
    const logDir = await this.ensureStorageDir(logId);
    const htmlPath = path.join(logDir, `${urlHash}.html`);
    await fs.writeFile(htmlPath, html, 'utf-8');
    return htmlPath;
  }

  /**
   * Save extraction metadata
   */
  private async saveMetadata(
    logId: string,
    urlHash: string,
    metadata: {
      url: string;
      fetchedAt: string;
      method: string;
      originalSize: number;
      extractedSize: number;
      title: string;
      content: string;
      htmlPath?: string;
      confidence?: number;
      screenshotPath?: string;
      extractionMetadata?: WebFetchResult['extractionMetadata'];
    },
  ): Promise<void> {
    const logDir = await this.ensureStorageDir(logId);
    const metadataPath = path.join(logDir, `${urlHash}.json`);
    await fs.writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      'utf-8',
    );
  }

  /**
   * Extract content using Mozilla Readability (intelligent article extraction)
   */
  private extractWithReadability(html: string, url: string): ExtractionResult {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        return {
          success: false,
          method: 'readability',
          confidence: 0,
          title: '',
          content: '',
        };
      }

      // Calculate confidence based on article quality
      const hasTitle = article.title && article.title.length > 0;
      const hasContent =
        article.textContent && article.textContent.length > 500;
      const hasExcerpt = article.excerpt && article.excerpt.length > 0;

      let confidence = 0;
      if (hasTitle) confidence += 0.3;
      if (hasContent) confidence += 0.5;
      if (hasExcerpt) confidence += 0.2;

      // Adjust confidence based on content length
      if (article.length && article.length > 1000) {
        confidence = Math.min(confidence + 0.1, 1.0);
      }

      const textContent = article.textContent || '';

      return {
        success: true,
        method: 'readability',
        confidence,
        title: article.title || '',
        content: textContent.substring(0, 5000),
        fullContent: textContent,
        excerpt: article.excerpt || '',
        byline: article.byline || '',
        length: article.length || undefined,
      };
    } catch (error) {
      console.warn('Readability extraction failed:', error.message);
      return {
        success: false,
        method: 'readability',
        confidence: 0,
        title: '',
        content: '',
      };
    }
  }

  /**
   * Extract content using Cheerio (fallback method)
   */
  private extractWithCheerio(html: string): ExtractionResult {
    try {
      const $ = cheerio.load(html);

      // Remove script and style tags
      $('script, style, nav, footer, iframe').remove();

      const title = $('title').text().trim() || $('h1').first().text().trim();
      const fullContent = $('body').text().replace(/\s+/g, ' ').trim();

      const content = fullContent.substring(0, 5000);

      return {
        success: true,
        method: 'cheerio',
        confidence: 0.5, // Cheerio always works but lower quality
        title,
        content,
        fullContent,
      };
    } catch (error) {
      console.warn('Cheerio extraction failed:', error.message);
      return {
        success: false,
        method: 'cheerio',
        confidence: 0,
        title: '',
        content: '',
      };
    }
  }

  /**
   * Capture screenshot of the page
   */
  private async captureScreenshot(
    url: string,
    logId: string,
    urlHash: string,
  ): Promise<string | null> {
    if (!this.screenshotsEnabled) {
      return null;
    }

    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: {
          width: parseInt(
            this.configService.get<string>('SCREENSHOT_VIEWPORT_WIDTH') ||
              '1920',
            10,
          ),
          height: parseInt(
            this.configService.get<string>('SCREENSHOT_VIEWPORT_HEIGHT') ||
              '1080',
            10,
          ),
        },
      });

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.screenshotTimeout,
      });

      const logDir = await this.ensureStorageDir(logId);
      const screenshotPath = path.join(logDir, `${urlHash}.png`);

      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        type: 'png',
      });

      await browser.close();
      return screenshotPath;
    } catch (error) {
      console.warn('Screenshot capture failed:', error.message);
      return null;
    }
  }

  /**
   * Extract content using Vision LLM (screenshot analysis)
   */
  private async extractWithVision(
    screenshotPath: string,
    url: string,
  ): Promise<ExtractionResult> {
    if (!this.visionEnabled || !screenshotPath) {
      return {
        success: false,
        method: 'vision',
        confidence: 0,
        title: '',
        content: '',
      };
    }

    try {
      // Read screenshot as base64
      const imageBuffer = await fs.readFile(screenshotPath);
      const base64Image = imageBuffer.toString('base64');

      // Call vision-enabled LLM (simplified prompt without JSON requirement)
      const prompt = `Analyze this screenshot of the webpage: ${url}

Extract and provide:
1. The main title or heading
2. The primary text content (focus on article body, ignore navigation/ads/footer)
3. Any charts, graphs, or important visual elements you see

Be concise but complete. Extract all readable text.`;

      const response = await this.ollama.generate({
        model: this.visionModel,
        prompt,
        images: [base64Image],
        // Note: No format: 'json' - qwen3-vl:8b doesn't support it reliably
      });

      // Parse the response as plain text
      const responseText = response.response.trim();

      // Extract title (look for first line or quoted text)
      let title = '';
      const titleMatch = responseText.match(
        /(?:title|heading)[:\s]+["']?([^"\n]+)["']?/i,
      );
      if (titleMatch) {
        title = titleMatch[1].trim();
      } else {
        // Fallback: use first line
        const firstLine = responseText.split('\n')[0];
        if (firstLine.length < 100) {
          title = firstLine;
        }
      }

      const content = responseText;
      const visualElements: Array<{ type: string; description: string }> = [];

      // Check for visual elements mentioned
      if (
        responseText.toLowerCase().includes('chart') ||
        responseText.toLowerCase().includes('graph') ||
        responseText.toLowerCase().includes('diagram')
      ) {
        visualElements.push({
          type: 'visual',
          description: 'Visual content detected in screenshot',
        });
      }

      // Calculate confidence based on response quality
      let confidence = 0.7; // Base confidence for vision extraction
      if (responseText.length > 200) confidence += 0.1;
      if (title.length > 5) confidence += 0.1;
      confidence = Math.min(confidence, 0.95);

      return {
        success: content.length > 100,
        method: 'vision',
        confidence,
        title,
        content: content.substring(0, 5000),
        fullContent: content,
        visualElements,
      };
    } catch (error) {
      console.warn('Vision extraction failed:', error.message);
      return {
        success: false,
        method: 'vision',
        confidence: 0,
        title: '',
        content: '',
      };
    }
  }

  private validateArgs(args: Record<string, any>): WebFetchArgs {
    if (typeof args.url !== 'string' || !args.url) {
      throw new Error('web_fetch: url must be a non-empty string');
    }
    if (args.logId !== undefined && typeof args.logId !== 'string') {
      throw new Error('web_fetch: logId must be a string');
    }
    return {
      url: args.url,
      logId: args.logId,
    };
  }

  async execute(args: Record<string, any>): Promise<WebFetchResult> {
    const { url, logId } = this.validateArgs(args);
    const overallStartTime = Date.now();

    // Generate logId if not provided (for testing and backwards compatibility)
    const sessionLogId = logId || `session_${Date.now()}`;
    const urlHash = this.hashUrl(url);

    // Track all extraction attempts for metadata
    const metadata: WebFetchResult['extractionMetadata'] = {
      selectionReason: '',
      totalDuration: 0,
    };

    this.logger.log(`[${sessionLogId}] Fetching URL: ${url}`);

    try {
      // 1. Download complete HTML (no size limit up to 100MB)
      const downloadStart = Date.now();
      const response = await axios.get(url, {
        timeout: this.timeout,
        maxContentLength: this.maxSize,
        maxBodyLength: this.maxSize,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      const html = response.data;
      const originalSize = Buffer.byteLength(html, 'utf-8');
      metadata.downloadDuration = Date.now() - downloadStart;

      this.logger.log(
        `[${sessionLogId}] Downloaded ${originalSize} bytes in ${metadata.downloadDuration}ms`,
      );

      // 2. Save complete HTML to disk (NEVER discard data)
      let htmlPath: string | undefined;
      try {
        htmlPath = await this.saveHtml(html, sessionLogId, urlHash);
        this.logger.log(`[${sessionLogId}] Saved HTML to: ${htmlPath}`);
      } catch (fileError) {
        this.logger.warn(
          `[${sessionLogId}] Failed to save HTML:`,
          fileError.message,
        );
        htmlPath = undefined;
      }

      // 3. Try extraction methods in priority order
      let result: ExtractionResult;
      let screenshotPath: string | null = null;

      // Try Readability first (fast, good for articles)
      const readabilityStart = Date.now();
      result = this.extractWithReadability(html, url);
      const readabilityDuration = Date.now() - readabilityStart;

      metadata.readability = {
        attempted: true,
        success: result.success,
        confidence: result.confidence,
        duration: readabilityDuration,
        contentLength: result.content.length,
      };

      this.logger.log(
        `[${sessionLogId}] Readability: success=${result.success}, confidence=${result.confidence}, duration=${readabilityDuration}ms`,
      );

      // Screenshot capture logic - separate from vision extraction
      // Capture screenshot if: alwaysScreenshot=true OR confidence < visionThreshold
      const shouldCaptureScreenshot =
        this.screenshotsEnabled &&
        (this.alwaysScreenshot || result.confidence < this.visionThreshold);

      if (shouldCaptureScreenshot) {
        const screenshotStart = Date.now();
        screenshotPath = await this.captureScreenshot(
          url,
          sessionLogId,
          urlHash,
        );
        const screenshotDuration = Date.now() - screenshotStart;

        if (screenshotPath) {
          const screenshotStats = await fs.stat(screenshotPath);
          this.logger.log(
            `[${sessionLogId}] Screenshot captured: ${screenshotPath} (${(screenshotStats.size / 1024).toFixed(2)} KB) in ${screenshotDuration}ms`,
          );
        } else {
          this.logger.warn(`[${sessionLogId}] Screenshot capture failed`);
        }
      }

      // Vision extraction logic - only if confidence is low AND vision is enabled
      const shouldUseVision =
        this.visionEnabled &&
        result.confidence < this.visionThreshold &&
        screenshotPath !== null;

      if (shouldUseVision && screenshotPath) {
        this.logger.log(
          `[${sessionLogId}] Readability confidence ${result.confidence} < ${this.visionThreshold}, trying Vision extraction`,
        );

        const screenshotStats = await fs.stat(screenshotPath);
        const visionStart = Date.now();
        const visionResult = await this.extractWithVision(screenshotPath, url);
        const visionDuration = Date.now() - visionStart;

        metadata.vision = {
          attempted: true,
          success: visionResult.success,
          confidence: visionResult.confidence,
          duration: visionDuration,
          model: this.visionModel,
          promptLength: 0, // Prompt length tracked in extractWithVision
          responseLength: visionResult.content.length,
          screenshotSize: screenshotStats.size,
        };

        this.logger.log(
          `[${sessionLogId}] Vision: success=${visionResult.success}, confidence=${visionResult.confidence}, duration=${visionDuration}ms`,
        );

        // Use vision result if it has better confidence or visual elements
        if (
          visionResult.success &&
          (visionResult.confidence > result.confidence ||
            (visionResult.visualElements &&
              visionResult.visualElements.length > 0))
        ) {
          result = visionResult;
          metadata.selectionReason =
            visionResult.confidence > metadata.readability.confidence
              ? `Vision confidence (${visionResult.confidence}) > Readability (${metadata.readability.confidence})`
              : `Vision detected ${visionResult.visualElements?.length || 0} visual elements`;
          this.logger.log(
            `[${sessionLogId}] Selected Vision extraction: ${metadata.selectionReason}`,
          );
        }
      } else if (
        this.visionEnabled &&
        result.confidence >= this.visionThreshold
      ) {
        this.logger.log(
          `[${sessionLogId}] Readability confidence ${result.confidence} >= ${this.visionThreshold}, skipping Vision extraction`,
        );
      }

      // Final fallback to Cheerio
      if (!result.success || result.confidence < 0.5) {
        this.logger.log(
          `[${sessionLogId}] Current method confidence ${result.confidence} < 0.5, falling back to Cheerio`,
        );

        const cheerioStart = Date.now();
        result = this.extractWithCheerio(html);
        const cheerioDuration = Date.now() - cheerioStart;

        metadata.cheerio = {
          attempted: true,
          success: result.success,
          duration: cheerioDuration,
          contentLength: result.content.length,
        };

        metadata.selectionReason =
          'Cheerio fallback (all other methods failed or low confidence)';
        this.logger.log(
          `[${sessionLogId}] Cheerio fallback: duration=${cheerioDuration}ms`,
        );
      }

      // If no selection reason set yet, it means Readability was used
      if (!metadata.selectionReason) {
        metadata.selectionReason = `Readability confidence (${metadata.readability.confidence}) >= 0.7`;
      }

      metadata.totalDuration = Date.now() - overallStartTime;

      // 4. Save extraction metadata
      try {
        await this.saveMetadata(sessionLogId, urlHash, {
          url,
          fetchedAt: new Date().toISOString(),
          method: result.method,
          originalSize,
          extractedSize: result.content.length,
          title: result.title,
          content: result.content,
          htmlPath,
          confidence: result.confidence,
          screenshotPath: screenshotPath || undefined,
          extractionMetadata: metadata,
        });
        this.logger.log(
          `[${sessionLogId}] Saved complete metadata including extraction details`,
        );
      } catch (metaError) {
        this.logger.warn(
          `[${sessionLogId}] Failed to save metadata:`,
          metaError.message,
        );
      }

      this.logger.log(
        `[${sessionLogId}] Extraction complete: method=${result.method}, duration=${metadata.totalDuration}ms`,
      );

      return {
        url,
        title: result.title,
        content: result.content,
        htmlPath,
        screenshotPath: screenshotPath || undefined,
        originalSize,
        extractionMethod: result.method,
        extractionMetadata: metadata,
      };
    } catch (error) {
      metadata.totalDuration = Date.now() - overallStartTime;

      // Handle errors gracefully - return partial result instead of crashing
      const statusCode = error.response?.status;
      const errorMessage =
        statusCode === 403
          ? 'Access denied (403 Forbidden) - website blocks automated access'
          : statusCode === 404
            ? 'Page not found (404)'
            : statusCode === 503
              ? 'Service unavailable (503)'
              : error.code === 'ECONNABORTED'
                ? 'Request timeout'
                : error.code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED'
                  ? `Content too large (exceeds ${this.maxSize / 1048576}MB limit)`
                  : `Request failed: ${error.message}`;

      this.logger.error(`[${sessionLogId}] Extraction failed: ${errorMessage}`);

      // Return partial result with error message instead of throwing
      return {
        url,
        title: 'Error fetching content',
        content: `Failed to fetch content from this URL. Error: ${errorMessage}. The search results summary may still provide useful information.`,
        extractionMethod: 'error',
        extractionMetadata: metadata,
      };
    }
  }
}
