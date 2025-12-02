# Research Agent System Design

**Date**: 2025-11-19
**Status**: Approved
**Technology**: NestJS 11.x, Ollama (qwen2.5), Tavily API

## Overview

Multi-stage LLM research agent that processes user queries through a 3-stage pipeline: query analysis → content retrieval → synthesis. Built with NestJS backend exposing REST API, designed for extensibility with pluggable tools and future Web UI integration.

## Architecture

### System Flow

```
User Query → LLM Stage 1 → Web Search → LLM Stage 2 → Web Fetch → LLM Stage 3 → Research Result
              (Analysis)                  (Selection)                (Synthesis)
                  ↓                            ↓                          ↓
              Logging                      Logging                    Logging
```

### Stage Breakdown

**Stage 1 - Query Analysis & Search:**
- Receives user query via REST API
- LLM (Ollama/qwen2.5) analyzes query and generates search terms
- Invokes Tavily search tool with optimized queries
- Logs: query, LLM reasoning, search parameters, execution time

**Stage 2 - Content Selection & Fetch:**
- LLM receives search results (titles, snippets, URLs)
- Decides which sources to fetch for deeper analysis
- Invokes web fetch tool to retrieve full content
- Logs: selected URLs, LLM reasoning, fetch status, execution time

**Stage 3 - Synthesis:**
- LLM receives fetched content + original query
- Synthesizes comprehensive research result
- Returns structured answer with sources cited
- Logs: content summary, final answer, execution time

## Technology Stack

- **Framework**: NestJS 11.x (TypeScript)
- **LLM**: Ollama (localhost:11434) with qwen2.5 model
- **Search**: Tavily API (pluggable interface)
- **HTTP**: Axios for web content fetching
- **Logging**: Winston (structured JSON logs)
- **Validation**: class-validator, class-transformer
- **Testing**: Jest

## Component Structure

### Core Modules

**1. ResearchModule**
- `ResearchController` - REST endpoints (`POST /api/research/query`)
- `ResearchService` - Orchestrates 3-stage pipeline
- `PipelineExecutor` - Manages stage transitions and logging

**2. LLMModule**
- `OllamaService` - Wraps Ollama API calls
- `PromptBuilder` - Constructs stage-specific prompts
- `ToolCallParser` - Extracts tool calls from LLM responses

**3. ToolsModule**
- `ISearchProvider` interface (abstraction layer)
- `TavilySearchProvider` implements ISearchProvider
- `WebFetchProvider` - HTTP content retrieval
- Future: `PlaywrightProvider`, `PDFProvider`

**4. LoggingModule**
- `ResearchLogger` - Structured logging with Winston
- Log schema: `{ stage, component, input, output, executionTime, timestamp }`

## Tool System Design

### Standard Tool Calling Format

Following OpenAI-compatible JSON schema format supported by Ollama:

```typescript
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      required: string[];
      properties: Record<string, {
        type: string;
        description: string;
      }>;
    };
  };
}
```

### Example Tool Definition

```typescript
const tavilySearchTool: ToolDefinition = {
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
          description: 'The search query'
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results (default: 5)'
        }
      }
    }
  }
};
```

### Tool Registry

```typescript
class ToolRegistry {
  private tools = new Map<string, ITool>();

  register(tool: ITool): void {
    this.tools.set(tool.definition.function.name, tool);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  async execute(name: string, args: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    return tool.execute(args);
  }
}
```

**Design Principle**: Pluggable architecture allows easy addition of new tools (Playwright, PDF extraction, etc.) by implementing `ITool` interface and registering with the registry.

## Pipeline Orchestration

### Message Flow

```typescript
async executeResearchPipeline(query: string): Promise<ResearchResult> {
  const messages = [{ role: 'user', content: query }];

  // Stage 1: Query Analysis & Search
  const stage1 = await this.executeStage({
    stageNumber: 1,
    messages,
    tools: [tavilySearchTool],
    systemPrompt: `You are a research assistant. Analyze the user's query and use the tavily_search tool to find relevant information. Generate 2-3 targeted search queries to thoroughly research the topic.`
  });

  // Execute tool calls from Stage 1
  const searchResults = await this.executeToolCalls(stage1.tool_calls);
  messages.push(stage1.message);
  messages.push({ role: 'tool', content: JSON.stringify(searchResults) });

  // Stage 2: Source Selection & Fetch
  const stage2 = await this.executeStage({
    stageNumber: 2,
    messages,
    tools: [webFetchTool],
    systemPrompt: `You have search results. Select 3-5 most relevant sources and use web_fetch to retrieve their full content for deeper analysis.`
  });

  const fetchedContent = await this.executeToolCalls(stage2.tool_calls);
  messages.push(stage2.message);
  messages.push({ role: 'tool', content: JSON.stringify(fetchedContent) });

  // Stage 3: Synthesis
  const stage3 = await this.executeStage({
    stageNumber: 3,
    messages,
    tools: [], // No tools, just synthesis
    systemPrompt: `Synthesize a comprehensive answer from the retrieved content. Include source citations and organize information clearly.`
  });

  return this.formatFinalResult(stage3, messages);
}
```

## Data Types

### API Request/Response

```typescript
// Request
POST /api/research/query
{
  "query": "What are the latest developments in quantum computing?",
  "options": {
    "maxSources": 5,
    "searchDepth": "comprehensive" | "quick"
  }
}

// Response
{
  "logId": "uuid-for-session",
  "answer": "Comprehensive research synthesis...",
  "sources": [
    { "url": "...", "title": "...", "relevance": "high" }
  ],
  "metadata": {
    "totalExecutionTime": 12500,
    "stages": [
      { "stage": 1, "executionTime": 3200 },
      { "stage": 2, "executionTime": 5800 },
      { "stage": 3, "executionTime": 3500 }
    ]
  }
}
```

### Internal Types

```typescript
interface StageContext {
  stageNumber: 1 | 2 | 3;
  messages: Message[];
  tools: ToolDefinition[];
  systemPrompt: string;
}

interface StageResult {
  message: Message;
  tool_calls: ToolCall[];
  executionTime: number;
}

interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}
```

## Error Handling & Resilience

### Retry Strategy

```typescript
async executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  backoffMs = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await this.delay(backoffMs * Math.pow(2, i));
      this.logger.warn(`Retry ${i + 1}/${maxRetries}`, { error });
    }
  }
}
```

### Failure Scenarios

| Scenario | Stage | Strategy |
|----------|-------|----------|
| Ollama down | Any | Return 503 with retry-after header |
| Tavily API limit | 1 | Throw BadRequestException with clear message |
| Web fetch timeout | 2 | Continue with partial results |
| Tool parsing error | Any | Log error, skip malformed tool calls |
| Stage 1 failure | 1 | Fail fast - cannot proceed without search |
| Stage 2 failure | 2 | Graceful degradation with available content |
| Stage 3 failure | 3 | Fallback to simpler synthesis prompt |

### Graceful Degradation

```typescript
async executeStage(context: StageContext): Promise<StageResult> {
  try {
    // Normal execution with retry logic
    return await this.executeWithRetry(() => this.ollamaService.chat(...));
  } catch (error) {
    this.logger.logStageError(context.stageNumber, error);

    if (context.stageNumber === 1) {
      throw new BadRequestException('Failed to process query');
    } else if (context.stageNumber === 2) {
      return this.handlePartialResults(context);
    } else {
      return this.fallbackSynthesis(context);
    }
  }
}
```

## Structured Logging

### Log Entry Schema

```typescript
interface LogEntry {
  timestamp: string;
  logId: string; // UUID for research session
  stage: number;
  component: string; // 'ollama', 'tavily', 'webfetch', 'pipeline'
  operation: string; // 'chat', 'search', 'fetch', 'execute_stage'
  input?: any;
  output?: any;
  executionTime: number;
  metadata?: {
    model?: string;
    toolCalls?: number;
    tokensUsed?: number;
    error?: string;
  };
}
```

### Winston Configuration

```typescript
@Injectable()
export class ResearchLogger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: 'logs/research-error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/research-combined.log'
        }),
        new winston.transports.Console({
          format: winston.format.simple(),
          level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
        })
      ]
    });
  }
}
```

### Log Retrieval

```typescript
GET /api/research/logs/:logId
// Returns all LogEntry[] for a specific research session
```

## API Endpoints

### Research Query

```
POST /api/research/query
Content-Type: application/json

Body: {
  query: string;
  options?: {
    maxSources?: number;      // Default: 5
    searchDepth?: 'quick' | 'comprehensive'; // Default: 'comprehensive'
  }
}

Response: {
  logId: string;
  answer: string;
  sources: Array<{ url: string; title: string; relevance: string }>;
  metadata: {
    totalExecutionTime: number;
    stages: Array<{ stage: number; executionTime: number }>;
  }
}
```

### Get Logs

```
GET /api/research/logs/:logId

Response: LogEntry[]
```

### Health Check

```
GET /api/health

Response: {
  status: 'healthy' | 'degraded';
  services: {
    ollama: boolean;
    tavily: boolean;
  }
}
```

## Configuration

### Environment Variables

```bash
# .env
NODE_ENV=development
PORT=3000

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5

# Tavily API
TAVILY_API_KEY=your_api_key_here

# Web Fetch
WEB_FETCH_TIMEOUT=10000
WEB_FETCH_MAX_SIZE=1048576  # 1MB

# Logging
LOG_LEVEL=info
LOG_DIR=./logs
```

### Configuration Module

```typescript
@Module({})
export class ConfigModule {
  @Global()
  providers: [
    {
      provide: 'OLLAMA_CONFIG',
      useValue: {
        baseUrl: process.env.OLLAMA_BASE_URL,
        model: process.env.OLLAMA_MODEL
      }
    },
    {
      provide: 'TAVILY_CONFIG',
      useValue: {
        apiKey: process.env.TAVILY_API_KEY
      }
    }
  ]
}
```

## Project Structure

```
research-agent/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   └── config.module.ts
│   ├── research/
│   │   ├── research.module.ts
│   │   ├── research.controller.ts
│   │   ├── research.service.ts
│   │   ├── pipeline-executor.service.ts
│   │   └── dto/
│   │       ├── research-query.dto.ts
│   │       └── research-response.dto.ts
│   ├── llm/
│   │   ├── llm.module.ts
│   │   ├── ollama.service.ts
│   │   ├── prompt-builder.service.ts
│   │   └── interfaces/
│   │       └── tool-definition.interface.ts
│   ├── tools/
│   │   ├── tools.module.ts
│   │   ├── interfaces/
│   │   │   └── tool.interface.ts
│   │   ├── registry/
│   │   │   └── tool-registry.service.ts
│   │   └── providers/
│   │       ├── tavily-search.provider.ts
│   │       └── web-fetch.provider.ts
│   └── logging/
│       ├── logging.module.ts
│       └── research-logger.service.ts
├── logs/
├── docs/
│   └── plans/
├── test/
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

## Implementation Steps

1. **Initialize NestJS project** using NestJS CLI (will use latest NestJS 11.x)
2. **Implement tool system** with standard Ollama tool calling format
3. **Build Tavily search provider** implementing ITool interface
4. **Build web fetch provider** with timeout and size limits
5. **Create Ollama service** with tool calling support
6. **Implement tool registry** for pluggable architecture
7. **Build pipeline executor** with 3-stage orchestration
8. **Add structured logging** with Winston
9. **Implement error handling** with retry logic and graceful degradation
10. **Create REST API endpoints** with DTOs and validation
11. **Add health checks** for Ollama and Tavily services
12. **Write unit tests** for services
13. **Write integration tests** for pipeline flow
14. **Create .env.example** with configuration documentation

## Future Enhancements

### Phase 2
- PDF extraction tool (pdf-parse or pdf.js)
- Playwright provider for dynamic content
- Evaluation mechanism with quality scoring
- Caching layer for search results

### Phase 3
- Web UI (React/Next.js frontend)
- Streaming responses via Server-Sent Events
- Multi-model support (switch between Ollama models)
- Research session history and replay

### Phase 4
- Academic research mode (citation formatting)
- Business intelligence mode (market data)
- Technical documentation mode (code examples)
- Multi-language support

## Design Decisions

### Why NestJS?
- Strong TypeScript support with decorators
- Modular architecture aligns with our component design
- Built-in dependency injection for testability
- Easy integration with future Web UI

### Why qwen2.5?
- Excellent instruction following for agent tasks
- Strong structured output generation (JSON)
- Better than llama3 for tool calling
- Faster than mixtral while maintaining quality

### Why Tavily?
- AI-optimized search results
- Clean structured data for LLM consumption
- Generous free tier (1000 searches/month)
- Better than raw HTML scraping

### Why defer PDF support?
- HTML/text covers 90% of research needs
- PDF parsing adds significant complexity
- Can be added as pluggable tool later
- Keeps MVP focused and deliverable

### Why defer evaluation mechanism?
- Need baseline performance data first
- Complex to implement without real usage patterns
- Logging provides foundation for future evaluation
- Can iterate on evaluation criteria with user feedback

## Success Criteria

- **Functional**: Successfully completes 3-stage research pipeline
- **Reliable**: Handles failures gracefully with retry logic
- **Observable**: Comprehensive logging for debugging and analysis
- **Extensible**: Easy to add new tools via ITool interface
- **Performant**: Average query completion <30 seconds
- **Maintainable**: Clear module boundaries and typed interfaces
