# Multi-Provider Web Search System Design

**Date**: 2025-11-30
**Status**: Approved
**Author**: Design Session

## Problem Statement

The research agent currently relies on a single search provider (Tavily). This creates three problems:
1. No fallback when Tavily fails or hits rate limits
2. Cannot leverage provider-specific strengths (privacy, recent content, specialized indexes)
3. LLM cannot select the optimal search tool for each query type

## Solution Overview

We will add three new search providers—DuckDuckGo, Brave Search, and SerpAPI—alongside Tavily. The LLM will select the most appropriate provider based on rich tool descriptions that highlight each provider's specialization.

## Architecture

### Core Pattern: Provider-per-Tool

Each search provider becomes a separate tool implementing the `ITool` interface. The existing ToolRegistry handles registration, and the LLM selects tools based on their descriptions.

**Benefits**:
- Zero orchestration code—LLM handles selection
- Each provider operates independently
- System works with any subset of providers
- Tool descriptions guide intelligent selection

### Provider Specializations

**Tavily Search** (`tavily_search`)
- **Specialty**: Premium, AI-optimized results with relevance scoring
- **Best for**: Comprehensive research, academic queries, fact-checking, authoritative sources
- **Cost**: Paid API with usage limits

**DuckDuckGo Search** (`duckduckgo_search`)
- **Specialty**: Privacy-focused, unbiased general web search
- **Best for**: General knowledge, privacy-sensitive queries, baseline research
- **Cost**: Free (no API key required)

**Brave Search** (`brave_search`)
- **Specialty**: Independent index emphasizing recent content
- **Best for**: Breaking news, cryptocurrency/Web3 topics, current events
- **Cost**: Paid API with free tier

**SerpAPI Search** (`serpapi_search`)
- **Specialty**: Google search results with rich snippets
- **Best for**: Shopping, local queries, images/videos, mainstream consensus
- **Cost**: Paid API with free tier

### Configuration Strategy

Each provider declares whether it requires an API key:

```typescript
class DuckDuckGoSearchProvider implements ITool {
  readonly requiresApiKey = false;  // Always available
}

class BraveSearchProvider implements ITool {
  readonly requiresApiKey = true;   // Requires configuration
}
```

**Registration Logic**:
- Providers without `requiresApiKey` or with valid API keys register automatically
- Providers without valid API keys skip registration silently
- System logs active providers at startup
- Health endpoint reports which providers are available

**Environment Variables** (all optional):
```bash
TAVILY_API_KEY=your_tavily_key
DUCKDUCKGO_API_KEY=  # Not needed for basic usage
BRAVE_API_KEY=your_brave_key
SERPAPI_API_KEY=your_serpapi_key
```

## Component Design

### File Structure

```
src/tools/providers/
  ├── tavily-search.provider.ts (existing)
  ├── duckduckgo-search.provider.ts (new)
  ├── brave-search.provider.ts (new)
  ├── serpapi-search.provider.ts (new)
  └── interfaces/
      ├── tavily-search-args.interface.ts (existing)
      ├── duckduckgo-search-args.interface.ts (new)
      ├── brave-search-args.interface.ts (new)
      └── serpapi-search-args.interface.ts (new)
```

### Provider Implementation

Each provider implements:

1. **ITool Interface**: With specialized `ToolDefinition` describing its strengths
2. **Constructor**: Accepts `ConfigService` and database-persisted logger
3. **Argument Validation**: Type-safe parameter checking
4. **Execute Method**: HTTP requests with timeout, retry logic, error handling
5. **Response Mapping**: Transforms provider-specific responses to `SearchResult[]`
6. **Comprehensive Logging**: All operations logged to database for UI visibility

### Logging Strategy

All search operations persist to the database using the existing `ResearchLoggerService`:

**Log Points**:
1. Tool selection by LLM (query, parameters, timestamp)
2. API request initiation (provider name, query)
3. API response (result count, response time, success/failure)
4. Error conditions (provider, error message, context)
5. Result transformation (successful mapping to SearchResult[])

**Benefits**:
- Complete audit trail visible in UI
- Debugging tool selection patterns
- Monitoring API usage per provider
- Quality assessment of results

### Error Handling

Each provider implements consistent error handling:

**Error Categories**:
- **Configuration Errors**: Invalid/missing API keys (prevent registration)
- **Rate Limit Errors**: Provider quota exceeded (throw specific error)
- **Timeout Errors**: Network/API timeouts (configurable per provider)
- **Validation Errors**: Invalid parameters (throw immediately)
- **Parse Errors**: Malformed responses (log and throw)

**Pattern**:
```typescript
async execute(args: Record<string, any>): Promise<SearchResult[]> {
  const validated = this.validateArgs(args);

  await this.logger.logToolExecution({
    tool: 'duckduckgo_search',
    query: validated.query,
    timestamp: new Date(),
  });

  try {
    const response = await this.searchApi(validated);
    await this.logger.logToolResult({
      tool: 'duckduckgo_search',
      resultCount: response.length,
      success: true,
    });
    return response;
  } catch (error) {
    await this.logger.logToolError({
      tool: 'duckduckgo_search',
      error: error.message,
      success: false,
    });
    throw error;
  }
}
```

**Result**: LLM can try alternative providers when one fails. System degrades gracefully.

## Data Flow

1. **LLM receives user query** with available tools (only registered providers)
2. **LLM selects one or more providers** based on tool descriptions
3. **Each provider executes** independently, logging all operations
4. **Results return** as standardized `SearchResult[]` arrays
5. **LLM aggregates results** from multiple providers if needed
6. **Source selection occurs** before web_fetch (results from different providers)

## Interface Contracts

### SearchResult Interface (unchanged)

```typescript
interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}
```

Provider identity comes from the tool name, not result metadata.

### Tool Definition Example

```typescript
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
          description: 'Maximum results to return (default: 5)',
        },
      },
    },
  },
};
```

## Testing Strategy

### Unit Tests (per provider)

- Tool definition validation
- Argument validation (required/optional)
- API request formatting
- Response mapping to SearchResult[]
- Error handling scenarios
- Database logging verification

### Integration Tests

- ToolsModule registration with/without API keys
- Multiple providers active simultaneously
- Provider selection patterns
- Graceful degradation when providers fail

### E2E Tests

- Research queries using different providers
- Multi-provider result aggregation
- Database log persistence
- Health endpoint reporting active providers

## Implementation Phases

### Phase 1: Core Infrastructure
- Add optional `requiresApiKey` to ITool interface
- Create argument interface files
- Update `.env.example`
- Implement conditional registration in ToolsModule

### Phase 2: DuckDuckGo Provider
- Implement free-tier provider (no API key)
- Add privacy-focused tool description
- Implement HTTP client with error handling
- Add database logging
- Write unit tests

### Phase 3: Brave Search Provider
- Implement with API authentication
- Add recent-content tool description
- Implement API integration
- Add database logging
- Write unit tests

### Phase 4: SerpAPI Provider
- Implement with API authentication
- Add Google-focused tool description
- Implement API integration
- Add database logging
- Write unit tests

### Phase 5: Integration & Testing
- Integration tests for multi-provider scenarios
- E2E tests with provider selection
- Update health endpoint
- Documentation updates

## Success Criteria

1. All providers register correctly based on API key availability
2. LLM selects appropriate providers for different query types
3. All tool executions persist to database for UI visibility
4. System works with any subset of providers (including zero)
5. Comprehensive test coverage (unit, integration, E2E)
6. DuckDuckGo available as free fallback

## Migration Path

This change requires no breaking changes:
- Existing Tavily integration continues working
- New providers add capabilities
- System remains functional with current configuration
- New API keys are optional additions

## Future Enhancements

- Provider performance metrics and benchmarking
- Automatic provider selection based on historical quality
- Cost tracking and optimization
- Provider-specific parameter customization
- Geographic/language-specific provider routing
