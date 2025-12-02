# Adding New Search Providers

This guide explains how to add new search providers to the Research Agent system.

## Overview

The multi-provider search system allows the Research Agent to use multiple search APIs, each with different strengths and specializations. Providers are conditionally registered based on API key availability.

## Provider Registration Logic

Providers are automatically registered if:
1. They don't require an API key (`requiresApiKey = false` or `undefined`), OR
2. They have a valid API key configured in the environment

## Step-by-Step Guide

### 1. Create Argument Interface

Create a new file in `src/tools/providers/interfaces/`:

```typescript
// Example: my-search-args.interface.ts
export interface MySearchArgs {
  query: string;
  max_results?: number;
  // Add provider-specific parameters here
}
```

### 2. Implement Provider Class

Create your provider in `src/tools/providers/`:

```typescript
// Example: my-search.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ITool } from '../interfaces/tool.interface';
import { ToolDefinition } from '../interfaces/tool-definition.interface';
import { SearchResult } from '../interfaces/search-result.interface';
import { MySearchArgs } from './interfaces/my-search-args.interface';

@Injectable()
export class MySearchProvider implements ITool {
  // Set to true if API key is required
  readonly requiresApiKey = true;

  readonly definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'my_search',
      description: 'Your provider description. Best for: [use cases]',
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
  private readonly apiUrl = 'https://api.example.com/search';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MY_SEARCH_API_KEY') || '';
  }

  private validateArgs(args: Record<string, any>): MySearchArgs {
    if (typeof args.query !== 'string' || !args.query) {
      throw new Error('my_search: query must be a non-empty string');
    }
    if (args.max_results !== undefined && typeof args.max_results !== 'number') {
      throw new Error('my_search: max_results must be a number');
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
          'Authorization': `Bearer ${this.apiKey}`,
        },
        timeout: 10000,
      });

      // Map provider results to SearchResult[]
      return response.data.results.map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.snippet,
      }));
    } catch (error) {
      throw new Error(`My Search failed: ${error.message}`);
    }
  }
}
```

### 3. Update Environment Configuration

Add your API key to `.env.example`:

```bash
# Search Provider API Keys
MY_SEARCH_API_KEY=your_key_here
```

### 4. Register Provider in ToolsModule

Update `src/tools/tools.module.ts`:

```typescript
import { MySearchProvider } from './providers/my-search.provider';

@Module({
  providers: [
    // ... existing providers
    MySearchProvider,
  ],
  exports: [ToolRegistry, /* ... */, MySearchProvider],
})
export class ToolsModule implements OnModuleInit {
  constructor(
    // ... existing injections
    private readonly mySearch: MySearchProvider,
  ) {}

  onModuleInit() {
    // ... existing registrations
    this.tryRegisterProvider(this.mySearch, 'MySearch');

    this.logActiveProviders();
  }
}
```

### 5. Write Unit Tests

Create `src/tools/providers/my-search.provider.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MySearchProvider } from './my-search.provider';

describe('MySearchProvider', () => {
  let provider: MySearchProvider;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MySearchProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    provider = module.get<MySearchProvider>(MySearchProvider);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should have correct tool definition', () => {
    expect(provider.definition.function.name).toBe('my_search');
    expect(provider.requiresApiKey).toBe(true);
  });

  it('should validate arguments correctly', () => {
    expect(() => provider['validateArgs']({ query: '' }))
      .toThrow('query must be a non-empty string');
  });

  // Add more tests for execute(), error handling, etc.
});
```

### 6. Manual Testing

1. Get an API key from the provider
2. Add to `.env`: `MY_SEARCH_API_KEY=your_actual_key`
3. Build and run: `npm run build && npm start`
4. Verify in logs: `[ToolsModule] Registered MySearch provider`
5. Test a search query through the API

## Provider Specializations

When writing your provider description, clearly indicate its strengths:

- **DuckDuckGo**: Privacy-focused, general queries, unbiased results
- **Brave**: Recent news, crypto/blockchain, Web3, fresh content
- **SerpAPI**: Location-based, shopping, Google Knowledge Graph
- **Tavily**: AI-optimized results, research queries

## Best Practices

1. **Error Handling**: Always wrap API calls in try-catch blocks
2. **Timeouts**: Set reasonable timeouts (10-15 seconds)
3. **Result Mapping**: Ensure results conform to `SearchResult[]` interface
4. **API Key Validation**: Check for empty/invalid keys early
5. **Rate Limiting**: Consider implementing rate limiting for production
6. **Logging**: Use console.log for now (database logging in Phase 5)

## Troubleshooting

### Provider Not Registering
- Check API key is set in `.env` file
- Verify `requiresApiKey` matches your needs
- Check logs for "Skipped" messages

### TypeScript Errors
- Ensure argument interface is properly typed
- Verify `SearchResult[]` return type is correct
- Check all imports are correct

### Runtime Errors
- Verify API endpoint URL is correct
- Check API key format/authentication method
- Test API directly with curl/Postman first
- Review timeout settings

## Example Providers

See implementations in `src/tools/providers/`:
- `tavily-search.provider.ts` - Full implementation with API key
- `web-fetch.provider.ts` - Complex implementation with screenshots
- Future: `duckduckgo-search.provider.ts`, `brave-search.provider.ts`, `serpapi-search.provider.ts`
