# Multi-Provider Web Search Implementation Plan

**Date**: 2025-11-30
**Status**: Ready for Implementation
**Design Document**: [2025-11-30-multi-provider-search-design.md](./2025-11-30-multi-provider-search-design.md)

## Implementation Order

This plan breaks the work into incremental, testable phases. Each phase produces working, tested code before moving to the next.

## Phase 1: Core Infrastructure (2-3 hours)

### 1.1 Update ITool Interface

**File**: `src/tools/interfaces/tool.interface.ts`

Add optional `requiresApiKey` property:

```typescript
export interface ITool {
  definition: ToolDefinition;
  requiresApiKey?: boolean;  // Add this optional property
  execute(args: Record<string, any>): Promise<any>;
}
```

**Test**: Verify existing providers still compile.

### 1.2 Create Argument Interfaces

**Files to Create**:
- `src/tools/providers/interfaces/duckduckgo-search-args.interface.ts`
- `src/tools/providers/interfaces/brave-search-args.interface.ts`
- `src/tools/providers/interfaces/serpapi-search-args.interface.ts`

**Template**:
```typescript
export interface DuckDuckGoSearchArgs {
  query: string;
  max_results?: number;
}
```

### 1.3 Update Environment Configuration

**File**: `.env.example`

Add:
```bash
# Search Provider API Keys (all optional)
TAVILY_API_KEY=your_tavily_key_here
DUCKDUCKGO_API_KEY=  # Not required for basic usage
BRAVE_API_KEY=your_brave_key_here
SERPAPI_API_KEY=your_serpapi_key_here
```

**File**: `src/config/environment.validation.ts`

Add optional validation for new keys (no required validation).

### 1.4 Update ToolsModule Registration

**File**: `src/tools/tools.module.ts`

Add conditional registration logic:

```typescript
@Module({
  providers: [
    ToolRegistry,
    TavilySearchProvider,
    WebFetchProvider,
    DuckDuckGoSearchProvider,  // Add
    BraveSearchProvider,        // Add
    SerpApiSearchProvider,      // Add
  ],
  exports: [ToolRegistry, TavilySearchProvider, WebFetchProvider],
})
export class ToolsModule implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly tavilySearch: TavilySearchProvider,
    private readonly webFetch: WebFetchProvider,
    private readonly duckduckgoSearch: DuckDuckGoSearchProvider,  // Add
    private readonly braveSearch: BraveSearchProvider,            // Add
    private readonly serpapiSearch: SerpApiSearchProvider,        // Add
  ) {}

  onModuleInit() {
    // Register all tools with conditional logic
    this.tryRegisterProvider(this.tavilySearch, 'Tavily');
    this.tryRegisterProvider(this.webFetch, 'WebFetch');
    this.tryRegisterProvider(this.duckduckgoSearch, 'DuckDuckGo');
    this.tryRegisterProvider(this.braveSearch, 'Brave');
    this.tryRegisterProvider(this.serpapiSearch, 'SerpAPI');

    this.logActiveProviders();
  }

  private tryRegisterProvider(provider: ITool, name: string) {
    if (!provider.requiresApiKey || this.hasValidApiKey(provider, name)) {
      this.toolRegistry.register(provider);
      console.log(`[ToolsModule] Registered ${name} search provider`);
    } else {
      console.log(`[ToolsModule] Skipped ${name} - no valid API key`);
    }
  }

  private hasValidApiKey(provider: any, name: string): boolean {
    // Check if provider has configured API key
    return provider.apiKey && provider.apiKey.length > 0;
  }

  private logActiveProviders() {
    const tools = this.toolRegistry.getAllTools();
    console.log(`[ToolsModule] Active tools: ${tools.map(t => t.definition.function.name).join(', ')}`);
  }
}
```

**Test**:
- Run application and verify only Tavily and WebFetch register (no new API keys yet)
- Check logs show "Skipped" messages for new providers

## Phase 2: DuckDuckGo Provider (3-4 hours)

### 2.1 Implement DuckDuckGo Provider

**File**: `src/tools/providers/duckduckgo-search.provider.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { DuckDuckGoSearchArgs } from './interfaces/duckduckgo-search-args.interface';

@Injectable()
export class DuckDuckGoSearchProvider implements ITool {
  readonly requiresApiKey = false;  // Free tier, no key needed

  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'duckduckgo_search',
      description: 'Privacy-focused web search. Best for: general web queries, privacy-sensitive searches, unbiased results without personalization. Good for broad topic exploration and mainstream information.',
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

  constructor(
    private configService: ConfigService,
    // TODO: Add ResearchLoggerService dependency
  ) {}

  private validateArgs(args: Record<string, any>): DuckDuckGoSearchArgs {
    if (typeof args.query !== 'string' || !args.query) {
      throw new Error('duckduckgo_search: query must be a non-empty string');
    }
    if (args.max_results !== undefined && typeof args.max_results !== 'number') {
      throw new Error('duckduckgo_search: max_results must be a number');
    }
    return {
      query: args.query,
      max_results: args.max_results,
    };
  }

  async execute(args: Record<string, any>): Promise<SearchResult[]> {
    const { query, max_results = 5 } = this.validateArgs(args);

    // TODO: Add database logging here

    try {
      // DuckDuckGo API implementation
      const response = await axios.get(this.apiUrl, {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1,
        },
        timeout: 10000,
      });

      // TODO: Add success logging here

      // Parse and map results to SearchResult[]
      const results: SearchResult[] = [];

      // DuckDuckGo instant answer
      if (response.data.Abstract) {
        results.push({
          title: response.data.Heading || 'DuckDuckGo Instant Answer',
          url: response.data.AbstractURL || '',
          content: response.data.Abstract,
        });
      }

      // Related topics
      if (response.data.RelatedTopics) {
        const topics = response.data.RelatedTopics
          .filter((topic: any) => topic.Text && topic.FirstURL)
          .slice(0, max_results - results.length);

        for (const topic of topics) {
          results.push({
            title: topic.Result || topic.Text,
            url: topic.FirstURL,
            content: topic.Text,
          });
        }
      }

      return results.slice(0, max_results);
    } catch (error) {
      // TODO: Add error logging here
      throw new Error(`DuckDuckGo search failed: ${error.message}`);
    }
  }
}
```

**Note**: DuckDuckGo's free API is limited. Consider using `duckduckgo-search` npm package for better results:

```bash
npm install duckduckgo-search
```

### 2.2 Write Unit Tests

**File**: `src/tools/providers/duckduckgo-search.provider.spec.ts`

Test coverage:
- Tool definition validation
- Argument validation (required query, optional max_results)
- Successful search execution
- Response mapping
- Error handling (network errors, invalid responses)
- Logging calls (TODO: after adding logger)

### 2.3 Manual Testing

1. Run application without `DUCKDUCKGO_API_KEY` env var
2. Verify provider registers (free tier)
3. Test search query manually
4. Verify results format matches `SearchResult[]`

## Phase 3: Brave Search Provider (3-4 hours)

### 3.1 Implement Brave Search Provider

**File**: `src/tools/providers/brave-search.provider.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { BraveSearchArgs } from './interfaces/brave-search-args.interface';

@Injectable()
export class BraveSearchProvider implements ITool {
  readonly requiresApiKey = true;  // Requires API key

  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'brave_search',
      description: 'Independent search index with fresh content. Best for: recent news, cryptocurrency/blockchain topics, Web3 content, and privacy-focused searches. Emphasizes newer content and alternative perspectives.',
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
  private readonly apiUrl = 'https://api.search.brave.com/res/v1/web/search';

  constructor(private configService: ConfigService) {
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
    const { query, max_results = 5 } = this.validateArgs(args);

    try {
      const response = await axios.get(this.apiUrl, {
        params: {
          q: query,
          count: max_results,
        },
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': this.apiKey,
        },
        timeout: 10000,
      });

      // Map Brave results to SearchResult[]
      return (response.data.web?.results || []).map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.description,
      }));
    } catch (error) {
      throw new Error(`Brave search failed: ${error.message}`);
    }
  }
}
```

### 3.2 Write Unit Tests

**File**: `src/tools/providers/brave-search.provider.spec.ts`

### 3.3 Manual Testing

1. Get Brave API key from https://brave.com/search/api/
2. Add to `.env`: `BRAVE_API_KEY=your_key`
3. Run application and verify provider registers
4. Test search query manually

## Phase 4: SerpAPI Provider (3-4 hours)

### 4.1 Implement SerpAPI Provider

**File**: `src/tools/providers/serpapi-search.provider.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { SerpApiSearchArgs } from './interfaces/serpapi-search-args.interface';

@Injectable()
export class SerpApiSearchProvider implements ITool {
  readonly requiresApiKey = true;

  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'serpapi_search',
      description: 'Google search results with structured data. Best for: location-based queries, shopping searches, image/video search, and Google Knowledge Graph data. Provides rich snippets and featured content.',
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
  private readonly apiUrl = 'https://serpapi.com/search';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SERPAPI_API_KEY') || '';
  }

  private validateArgs(args: Record<string, any>): SerpApiSearchArgs {
    if (typeof args.query !== 'string' || !args.query) {
      throw new Error('serpapi_search: query must be a non-empty string');
    }
    if (args.max_results !== undefined && typeof args.max_results !== 'number') {
      throw new Error('serpapi_search: max_results must be a number');
    }
    return {
      query: args.query,
      max_results: args.max_results,
    };
  }

  async execute(args: Record<string, any>): Promise<SearchResult[]> {
    const { query, max_results = 5 } = this.validateArgs(args);

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
      return (response.data.organic_results || []).map((result: any) => ({
        title: result.title,
        url: result.link,
        content: result.snippet,
      }));
    } catch (error) {
      throw new Error(`SerpAPI search failed: ${error.message}`);
    }
  }
}
```

### 4.2 Write Unit Tests

**File**: `src/tools/providers/serpapi-search.provider.spec.ts`

### 4.3 Manual Testing

1. Get SerpAPI key from https://serpapi.com/
2. Add to `.env`: `SERPAPI_API_KEY=your_key`
3. Run application and verify provider registers
4. Test search query manually

## Phase 5: Database Logging Integration (2-3 hours)

### 5.1 Add Logger Injection

Update all providers to inject `ResearchLoggerService`:

```typescript
constructor(
  private configService: ConfigService,
  private logger: ResearchLoggerService,  // Add this
) {
  // ...
}
```

### 5.2 Add Logging Calls

In each provider's `execute()` method:

```typescript
async execute(args: Record<string, any>): Promise<SearchResult[]> {
  const validated = this.validateArgs(args);

  // Log tool execution
  await this.logger.logToolExecution({
    tool: this.definition.function.name,
    query: validated.query,
    timestamp: new Date(),
  });

  try {
    const results = await this.searchApi(validated);

    // Log success
    await this.logger.logToolResult({
      tool: this.definition.function.name,
      resultCount: results.length,
      success: true,
    });

    return results;
  } catch (error) {
    // Log error
    await this.logger.logToolError({
      tool: this.definition.function.name,
      error: error.message,
      success: false,
    });
    throw error;
  }
}
```

### 5.3 Verify Logging

- Test each provider
- Check database for log entries
- Verify UI displays logs correctly

## Phase 6: Integration & Testing (2-3 hours)

### 6.1 Integration Tests

**File**: `test/multi-provider-search.spec.ts`

Test scenarios:
- Multiple providers active simultaneously
- Graceful degradation when provider fails
- Registration with various API key configurations
- Provider selection patterns

### 6.2 E2E Tests

**File**: `test/research.e2e-spec.ts`

Add tests for:
- Research queries using different providers
- Multi-provider result aggregation
- Database log persistence
- Source diversity from multiple providers

### 6.3 Health Endpoint Update

**File**: `src/health/health.controller.ts`

Add endpoint to report active search providers:

```typescript
@Get('search-providers')
getSearchProviders() {
  const tools = this.toolRegistry.getAllTools();
  const searchProviders = tools.filter(t =>
    t.definition.function.name.includes('search')
  );

  return {
    count: searchProviders.length,
    providers: searchProviders.map(p => ({
      name: p.definition.function.name,
      description: p.definition.function.description,
      requiresApiKey: p.requiresApiKey || false,
    })),
  };
}
```

## Phase 7: Documentation & Cleanup (1-2 hours)

### 7.1 Update README

Add section explaining:
- Multiple search provider support
- How to configure API keys
- Provider specializations
- Example usage

### 7.2 Update API Documentation

Document:
- New tool definitions
- Environment variables
- Health endpoint for provider status

### 7.3 Commit All Changes

```bash
git add docs/plans/2025-11-30-multi-provider-search-*.md
git commit -m "docs: add multi-provider search design and implementation plan"

git add .env.example src/
git commit -m "feat: add multi-provider web search support

- Add DuckDuckGo, Brave Search, and SerpAPI providers
- Implement conditional registration based on API keys
- Add comprehensive database logging for all providers
- Update health endpoint to show active providers

Closes #[issue-number]"
```

## Rollback Plan

If issues arise:
1. Remove new provider imports from `ToolsModule`
2. System continues working with Tavily only
3. No breaking changes to existing functionality

## Validation Checklist

- [ ] All providers register correctly with/without API keys
- [ ] DuckDuckGo works without API key
- [ ] Tool descriptions accurately reflect provider specializations
- [ ] All search operations logged to database
- [ ] Logs visible in UI
- [ ] Unit tests pass for all providers
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Health endpoint shows active providers
- [ ] Documentation updated
- [ ] No breaking changes to existing functionality
