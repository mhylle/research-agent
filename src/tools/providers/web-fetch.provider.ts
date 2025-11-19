import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
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
            description: 'The URL to fetch content from'
          }
        }
      }
    }
  };

  private readonly timeout: number;
  private readonly maxSize: number;

  constructor(private configService: ConfigService) {
    this.timeout = this.configService.get<number>('WEB_FETCH_TIMEOUT') || 10000;
    this.maxSize = this.configService.get<number>('WEB_FETCH_MAX_SIZE') || 1048576;
  }

  async execute(args: Record<string, any>): Promise<WebFetchResult> {
    const { url } = args;

    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        maxContentLength: this.maxSize,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Research Agent Bot)',
        },
      });

      const $ = cheerio.load(response.data);

      // Remove script and style tags
      $('script, style, nav, footer, iframe').remove();

      const title = $('title').text().trim() || $('h1').first().text().trim();
      const content = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000); // Limit content size

      return {
        url,
        title,
        content,
      };
    } catch (error) {
      throw new Error(`Web fetch failed: ${error.message}`);
    }
  }
}
