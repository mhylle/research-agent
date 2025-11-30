import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { DuckDuckGoSearchArgs } from './interfaces/duckduckgo-search-args.interface';

@Injectable()
export class DuckDuckGoSearchProvider implements ITool {
  readonly requiresApiKey = false; // DuckDuckGo is free

  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'duckduckgo_search',
      description:
        'Search the web using DuckDuckGo with privacy-focused results. Best for instant answers and general queries.',
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

  private readonly apiUrl = 'https://api.duckduckgo.com/';

  private validateArgs(args: Record<string, any>): DuckDuckGoSearchArgs {
    if (typeof args.query !== 'string' || !args.query) {
      throw new Error('duckduckgo_search: query must be a non-empty string');
    }
    if (
      args.max_results !== undefined &&
      typeof args.max_results !== 'number'
    ) {
      throw new Error('duckduckgo_search: max_results must be a number');
    }
    return {
      query: args.query,
      max_results: args.max_results,
    };
  }

  async execute(args: Record<string, any>): Promise<SearchResult[]> {
    const { query, max_results = 5 } = this.validateArgs(args);

    console.log(
      `[DuckDuckGoSearchProvider] Executing search: "${query}" (max: ${max_results})`,
    );

    try {
      // DuckDuckGo Instant Answer API
      const response = await axios.get(this.apiUrl, {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1,
        },
        timeout: 10000,
        headers: {
          'User-Agent': 'ResearchAgent/1.0',
        },
      });

      const data = response.data;
      const results: SearchResult[] = [];

      // Extract abstract/instant answer if available
      if (data.Abstract && data.AbstractText) {
        results.push({
          title: data.Heading || 'DuckDuckGo Instant Answer',
          url: data.AbstractURL || data.AbstractSource || '',
          content: data.AbstractText,
          score: 1.0, // Highest priority for instant answer
        });
      }

      // Extract related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (results.length >= max_results) break;

          // Handle nested topics (categories)
          if (topic.Topics && Array.isArray(topic.Topics)) {
            for (const subtopic of topic.Topics) {
              if (results.length >= max_results) break;
              if (subtopic.Text && subtopic.FirstURL) {
                results.push({
                  title: this.extractTitle(subtopic.Text),
                  url: subtopic.FirstURL,
                  content: subtopic.Text,
                  score: 0.7,
                });
              }
            }
          }
          // Handle direct topics
          else if (topic.Text && topic.FirstURL) {
            results.push({
              title: this.extractTitle(topic.Text),
              url: topic.FirstURL,
              content: topic.Text,
              score: 0.8,
            });
          }
        }
      }

      // If no results, create a minimal result with available info
      if (results.length === 0 && data.Heading) {
        results.push({
          title: data.Heading,
          url: '',
          content:
            data.AbstractText ||
            'No detailed information available from DuckDuckGo.',
          score: 0.5,
        });
      }

      console.log(
        `[DuckDuckGoSearchProvider] Found ${results.length} results`,
      );
      return results;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[DuckDuckGoSearchProvider] Search failed: ${errorMessage}`,
      );
      throw new Error(`DuckDuckGo search failed: ${errorMessage}`);
    }
  }

  /**
   * Extract a clean title from the topic text
   * DuckDuckGo returns text like "Topic Name - Description"
   */
  private extractTitle(text: string): string {
    if (!text) return 'DuckDuckGo Result';

    // Split on common separators and take the first part
    const separators = [' - ', ' – ', ' — ', ': '];
    for (const sep of separators) {
      if (text.includes(sep)) {
        return text.split(sep)[0].trim();
      }
    }

    // If no separator found, take first 100 chars
    return text.length > 100 ? text.substring(0, 97) + '...' : text;
  }
}
