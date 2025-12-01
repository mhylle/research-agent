import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { TavilySearchArgs } from './interfaces/tavily-search-args.interface';
import { ResearchLogger } from '../../logging/research-logger.service';

@Injectable()
export class TavilySearchProvider implements ITool {
  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'tavily_search',
      description: 'Search the web for information using Tavily API',
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

  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.tavily.com/search';

  constructor(
    private configService: ConfigService,
    private logger: ResearchLogger,
  ) {
    this.apiKey = this.configService.get<string>('TAVILY_API_KEY') || '';
  }

  private validateArgs(args: Record<string, any>): TavilySearchArgs {
    if (typeof args.query !== 'string' || !args.query) {
      throw new Error('tavily_search: query must be a non-empty string');
    }
    if (
      args.max_results !== undefined &&
      typeof args.max_results !== 'number'
    ) {
      throw new Error('tavily_search: max_results must be a number');
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

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          api_key: this.apiKey,
          query: validated.query,
          max_results: validated.max_results || 5,
          search_depth: 'basic',
          include_answer: false,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );

      const results = response.data.results.map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        score: result.score,
      }));

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
      const executionTime = Date.now() - startTime;
      this.logger.logToolExecution(
        logId,
        this.definition.function.name,
        validated,
        { error: error.message },
        executionTime,
      );
      throw new Error(`Tavily search failed: ${error.message}`);
    }
  }
}
