import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { SerpApiSearchArgs } from './interfaces/serpapi-search-args.interface';
import { ResearchLogger } from '../../logging/research-logger.service';

@Injectable()
export class SerpApiSearchProvider implements ITool {
  readonly requiresApiKey = true; // Requires API key

  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'serpapi_search',
      description:
        'Google search results with structured data. Best for: location-based queries, shopping searches, image/video search, and Google Knowledge Graph data. Provides rich snippets and featured content.',
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
  private readonly apiUrl = 'https://serpapi.com/search';

  constructor(
    private configService: ConfigService,
    private logger: ResearchLogger,
  ) {
    this.apiKey = this.configService.get<string>('SERPAPI_API_KEY') || '';
  }

  private validateArgs(args: Record<string, any>): SerpApiSearchArgs {
    if (typeof args.query !== 'string' || !args.query) {
      throw new Error('serpapi_search: query must be a non-empty string');
    }
    if (
      args.max_results !== undefined &&
      typeof args.max_results !== 'number'
    ) {
      throw new Error('serpapi_search: max_results must be a number');
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

    console.log(
      `[SerpApiSearchProvider] Executing search for query: "${validated.query}" (max_results: ${validated.max_results || 5})`,
    );

    try {
      const response = await axios.get(this.apiUrl, {
        params: {
          q: validated.query,
          api_key: this.apiKey,
          num: validated.max_results || 5,
        },
        timeout: 10000,
      });

      // Map SerpAPI organic results to SearchResult[]
      const results: SearchResult[] = (
        response.data.organic_results || []
      ).map((result: any) => ({
        title: result.title,
        url: result.link,
        content: result.snippet,
      }));

      console.log(
        `[SerpApiSearchProvider] Search completed successfully. Found ${results.length} results.`,
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
      const errorMessage = `SerpAPI search failed: ${error.message}`;
      console.error(`[SerpApiSearchProvider] ${errorMessage}`);

      const executionTime = Date.now() - startTime;
      this.logger.logToolExecution(
        logId,
        this.definition.function.name,
        validated,
        { error: errorMessage },
        executionTime,
      );

      throw new Error(errorMessage);
    }
  }
}
