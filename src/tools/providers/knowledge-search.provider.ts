import { Injectable } from '@nestjs/common';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { KnowledgeSearchArgs } from './interfaces/knowledge-search-args.interface';
import { KnowledgeSearchService } from '../../knowledge/knowledge-search.service';
import { ResearchLogger } from '../../logging/research-logger.service';

@Injectable()
export class KnowledgeSearchProvider implements ITool {
  readonly requiresApiKey = false; // Internal search, no API key needed

  constructor(
    private readonly knowledgeSearchService: KnowledgeSearchService,
    private readonly logger: ResearchLogger,
  ) {}

  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'knowledge_search',
      description:
        'Search internal knowledge base for prior research results using hybrid semantic + full-text search. Best for finding previously researched topics. Returns synthesized answers from past research queries.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find relevant prior research',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
          },
        },
      },
    },
  };

  private validateArgs(args: Record<string, any>): KnowledgeSearchArgs {
    if (typeof args.query !== 'string' || !args.query) {
      throw new Error('knowledge_search: query must be a non-empty string');
    }
    if (
      args.max_results !== undefined &&
      typeof args.max_results !== 'number'
    ) {
      throw new Error('knowledge_search: max_results must be a number');
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
      `[KnowledgeSearchProvider] Searching knowledge base (hybrid): "${validated.query}" (max: ${validated.max_results || 5})`,
    );

    try {
      const knowledgeResults = await this.knowledgeSearchService.searchHybrid(
        validated.query,
        validated.max_results || 5,
      );

      // Convert KnowledgeSearchResult to standard SearchResult
      const results: SearchResult[] = knowledgeResults.map((result) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        score: result.score,
      }));

      console.log(
        `[KnowledgeSearchProvider] Found ${results.length} prior research results`,
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[KnowledgeSearchProvider] Search failed: ${errorMessage}`);

      const executionTime = Date.now() - startTime;
      this.logger.logToolExecution(
        logId,
        this.definition.function.name,
        validated,
        { error: errorMessage },
        executionTime,
      );

      throw new Error(`Knowledge search failed: ${errorMessage}`);
    }
  }
}
