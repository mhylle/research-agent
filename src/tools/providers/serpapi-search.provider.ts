import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { SerpApiSearchArgs } from './interfaces/serpapi-search-args.interface';

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

  constructor(private configService: ConfigService) {
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
    const { query, max_results = 5 } = this.validateArgs(args);

    console.log(
      `[SerpApiSearchProvider] Executing search for query: "${query}" (max_results: ${max_results})`,
    );

    try {
      const response = await axios.get(this.apiUrl, {
        params: {
          q: query,
          api_key: this.apiKey,
          num: max_results,
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

      return results;
    } catch (error) {
      const errorMessage = `SerpAPI search failed: ${error.message}`;
      console.error(`[SerpApiSearchProvider] ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }
}
