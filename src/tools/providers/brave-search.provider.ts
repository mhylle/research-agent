import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { BraveSearchArgs } from './interfaces/brave-search-args.interface';
import { ResearchLogger } from '../../logging/research-logger.service';

@Injectable()
export class BraveSearchProvider implements ITool {
  readonly requiresApiKey = true; // Requires API key

  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'brave_search',
      description:
        'Independent search index with fresh content. Best for: recent news, cryptocurrency/blockchain topics, Web3 content, and privacy-focused searches. Emphasizes newer content and alternative perspectives.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description: 'The search query',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
          },
        },
      },
    },
  };

  readonly apiKey: string;
  private readonly apiUrl = 'https://api.search.brave.com/res/v1/web/search';

  constructor(
    private configService: ConfigService,
    private logger: ResearchLogger,
  ) {
    this.apiKey = this.configService.get<string>('BRAVE_API_KEY') || '';
  }

  private validateArgs(args: Record<string, any>): BraveSearchArgs {
    if (typeof args.query !== 'string' || !args.query) {
      throw new Error('brave_search: query must be a non-empty string');
    }
    if (args.max_results !== undefined && typeof args.max_results !== 'number') {
      throw new Error('brave_search: max_results must be a number');
    }
    return {
      query: args.query,
      max_results: args.max_results,
    };
  }

  async execute(args: Record<string, any>): Promise<SearchResult[]> {
    const validated = this.validateArgs(args);
    const logId = `${this.definition.function.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    console.log(`[BraveSearchProvider] Executing search: ${validated.query}`);

    try {
      const response = await axios.get(this.apiUrl, {
        params: {
          q: validated.query,
          count: validated.max_results || 5,
        },
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': this.apiKey,
        },
        timeout: 10000,
      });

      const results: SearchResult[] = (response.data.web?.results || []).map(
        (result: any) => ({
          title: result.title,
          url: result.url,
          content: result.description,
        }),
      );

      console.log(
        `[BraveSearchProvider] Search successful: ${results.length} results`,
      );

      const executionTime = Date.now() - startTime;
      this.logger.logToolExecution(
        logId,
        this.definition.function.name,
        validated,
        { resultCount: results.length, results },
        executionTime,
      );

      return results;
    } catch (error) {
      console.error(`[BraveSearchProvider] Search failed: ${error.message}`);

      const executionTime = Date.now() - startTime;
      this.logger.logToolExecution(
        logId,
        this.definition.function.name,
        validated,
        { error: error.message },
        executionTime,
      );

      throw new Error(`Brave search failed: ${error.message}`);
    }
  }
}
