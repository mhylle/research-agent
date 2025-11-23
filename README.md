# Research Agent

Multi-stage LLM research agent built with NestJS that orchestrates web search and content synthesis using Ollama (qwen2.5) and Tavily API.

## Overview

The Research Agent implements a 3-stage pipeline:
1. **Query Analysis & Web Search**: Analyzes user queries and performs targeted web searches using Tavily API
2. **Source Selection & Content Fetch**: Selects relevant sources and fetches full content for deeper analysis
3. **Synthesis & Answer Generation**: Synthesizes comprehensive answers with source citations

### Architecture

- **Framework**: NestJS 11.x with TypeScript
- **LLM Provider**: Ollama (qwen2.5) with OpenAI-compatible tool calling
- **Search Provider**: Tavily API (pluggable architecture supports alternatives)
- **Logging**: Structured logging with Winston
- **Validation**: Request/response validation with class-validator

## Prerequisites

- **Node.js 18+**: Runtime environment
- **Ollama**: Local LLM server with qwen2.5 model installed
- **Tavily API Key**: Sign up at [tavily.com](https://tavily.com) for API access

## Installation

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your Tavily API key:
```bash
TAVILY_API_KEY=your_actual_api_key_here
```

3. Install and start Ollama with qwen2.5:
```bash
# Install Ollama (if not already installed)
# Visit: https://ollama.ai

# Pull the qwen2.5 model
ollama pull qwen2.5

# Start Ollama server
ollama serve
```

## Configuration

The `.env` file supports the following variables:

```bash
# Application
NODE_ENV=development
PORT=3000

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5

# Tavily API
TAVILY_API_KEY=your_api_key_here

# Web Fetch Settings
WEB_FETCH_TIMEOUT=10000      # 10 seconds
WEB_FETCH_MAX_SIZE=1048576   # 1MB

# Logging
LOG_LEVEL=info               # debug, info, warn, error
LOG_DIR=./logs
```

## Running the Application

### Development Mode
```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`

### Production Mode
```bash
# Build the application
npm run build

# Start production server
npm run start:prod
```

## API Documentation

### Research Query

Execute a research query with multi-stage pipeline processing.

**Endpoint**: `POST /api/research/query`

**Request Body**:
```json
{
  "query": "What are the latest developments in quantum computing?",
  "maxSources": 5,
  "searchDepth": "comprehensive"
}
```

**Request Parameters**:
- `query` (required): The research question or topic
- `maxSources` (optional): Maximum number of sources to retrieve (default: 5, range: 1-10)
- `searchDepth` (optional): Search depth - "quick" or "comprehensive" (default: "comprehensive")

**Response**:
```json
{
  "logId": "uuid-v4",
  "answer": "Comprehensive answer synthesized from multiple sources...",
  "sources": [
    {
      "url": "https://example.com/article",
      "title": "Article Title",
      "relevance": "high"
    }
  ],
  "metadata": {
    "totalExecutionTime": 12500,
    "stages": [
      { "stage": 1, "executionTime": 4200 },
      { "stage": 2, "executionTime": 5800 },
      { "stage": 3, "executionTime": 2500 }
    ]
  }
}
```

**Example cURL Request**:
```bash
curl -X POST http://localhost:3000/api/research/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is artificial intelligence?",
    "maxSources": 3
  }'
```

### Health Check

Check the health status of the application and its dependencies.

**Endpoint**: `GET /api/health`

**Response**:
```json
{
  "status": "healthy",
  "services": {
    "ollama": true,
    "tavily": true
  }
}
```

**Status Values**:
- `healthy`: All services are operational
- `degraded`: One or more services are unavailable

**Example cURL Request**:
```bash
curl http://localhost:3000/api/health
```

## Frontend (Angular UI)

### Development

**Run both backend and frontend:**
```bash
npm run dev
```

This starts:
- Backend API on `http://localhost:3000`
- Angular UI on `http://localhost:4200`

**Run frontend only:**
```bash
npm run client:dev
```

**Run tests:**
```bash
npm run client:test
```

### Production Build

**Build for production:**
```bash
npm run build:all
```

This creates:
- Backend build in `dist/`
- Frontend build copied to `dist/client/`

**Start production server:**
```bash
NODE_ENV=production npm run start:prod
```

The Angular UI will be served at `http://localhost:3000`

### Architecture

**Technology Stack:**
- Angular 20.2.0 (standalone components)
- TypeScript 5+
- SCSS (BEM methodology)
- Angular Signals (state management)
- D3.js v7 (graph visualizations)

**Directory Structure:**
```
client/
├── src/
│   ├── app/
│   │   ├── core/           # Services, interceptors
│   │   ├── features/       # Feature components
│   │   ├── models/         # TypeScript interfaces
│   │   └── shared/         # Shared components
│   ├── styles/             # Global SCSS
│   └── environments/       # Environment configs
```

**Features:**
- Single-page chat-style interface
- Real-time loading indicators
- LocalStorage-based history (last 20 queries)
- Error handling with retry
- Responsive design (mobile, tablet, desktop)

### API Integration

The Angular UI calls the existing NestJS API:
- `POST /api/research/query` - Submit research queries
- `GET /api/health` - Health check

In development, requests are proxied to `http://localhost:3000` via `proxy.conf.json`.

In production, the Angular build is served by NestJS using `@nestjs/serve-static`, so API calls use relative URLs.

## Log Visualization & Debugging (Phase 2 - Complete)

### Overview

Comprehensive debugging and visualization tools for understanding and optimizing the agentic research pipeline. Features dual-view interface with timeline and interactive graph visualizations.

### Access

Navigate to `/logs` in the Angular UI at `http://localhost:4200/logs`

### Features

#### **Sessions List**
- View all research sessions with query text and status
- Search by query text or logId
- Filter by status (completed ✅ / error ❌ / incomplete ⏳)
- See duration and timestamp for each session
- Click any session to view detailed breakdown

#### **Timeline View** (📋 Tab)
- Hierarchical view of the 3-stage research pipeline
- Color-coded stages:
  - 🔍 Stage 1 (Blue): Query Analysis & Search
  - 📄 Stage 2 (Purple): Content Fetch & Selection
  - ✨ Stage 3 (Green): Synthesis & Answer Generation
- Expandable nodes to view input/output
- Nested tool calls (tavily_search, web_fetch)
- JSON viewer with syntax highlighting
- Copy input/output data to clipboard

#### **Graph View** (📊 Tab) - NEW!
Interactive D3.js timeline visualization showing execution flow with full metrics.

**Node Types**:
- **Stage Nodes** (⚙️ blue bars): Pipeline stages with durations
- **Tool Nodes** (🔧 green dots): Tool executions
  - `tavily_search`: Web search queries (~1s latency)
  - `web_fetch`: Content fetching (0.1-1.8s latency)
- **LLM Nodes** (🤖 purple dots): Language model calls with token counts
  - Stage 1: ~650 tokens, 8s
  - Stage 2: ~3,000 tokens, 14s
  - Stage 3: ~4,800 tokens, 25s

**Interactive Features**:

*Hover Tooltips*:
- Hover over any node → instant preview tooltip
- Shows: name, status, duration, input/output (truncated), metrics
- Follows mouse cursor
- Auto-hides when mouse leaves

*Pinned Tooltips* (Click to Pin):
- Click any node → pin tooltip for detailed inspection
- Shows "📌 Pinned" indicator with blue border
- Tooltip becomes interactive:
  - Move mouse over tooltip without it disappearing
  - Use scrollbars to read long content
  - Select and copy text
  - Read full error messages
- Click × button or same node to unpin
- Click different node to switch pinned tooltip

*Zoom & Pan Controls*:
- 🔍+ Zoom in / 🔍− Zoom out / ⟲ Reset zoom
- Mouse wheel to zoom
- Click and drag to pan
- Scale extent: 0.5x to 5x

*View Modes*:
- **Gantt Chart**: Timeline bars showing execution spans (default)
- **Timeline**: Simplified event-based view
- **Dependencies**: Focus on node relationships

**Metrics Display**:
- **Tool latency**: Execution time for each tool call
- **Token counts**: LLM token usage per stage
- **Input/Output sizes**: Data volume metrics
- **Status indicators**: Color-coded completion status
- **Error messages**: Full error context for failed operations

### Debugging Workflow

**Quick Debug with Graph View**:
1. Navigate to `/logs` and select a session
2. Click **📊 Graph View** tab
3. Identify issues visually:
   - Long bars = slow stages
   - Red dots = errors (hover for details)
   - Purple dots = LLM calls (check token usage)
4. Hover over tool dots to see:
   - **tavily_search**: What queries were generated
   - **web_fetch**: Which URLs were fetched, any 403 errors
   - **llm**: Token consumption breakdown
5. Pin tooltips to read full error messages or output content
6. Zoom in to inspect specific time ranges

**Detailed Debug with Timeline View**:
1. Switch to **📋 Timeline View**
2. Expand stages to see nested structure
3. Click tool nodes for complete JSON data
4. Copy input/output for external analysis

**Example: Debug why Denmark municipality elections weren't found**:
1. Select Denmark query session
2. Graph View → Check Stage 1 tavily_search nodes
3. Hover over search dots → see which queries were generated
4. Pin tooltip → verify "municipality" or "kommunalvalg" was included
5. Check Stage 2 web_fetch nodes → see which sources were selected
6. Identify if relevant sources were missed or filtered out

### API Endpoints

**Logs API**:
- `GET /api/logs/sessions` - List all sessions with pagination/filtering
- `GET /api/logs/sessions/:logId` - Detailed session timeline
- `GET /api/logs/graph/:logId` - Graph visualization data (nodes, edges, metrics)

**Query Parameters**:
- `limit` - Sessions to return (default: 50, max: 200)
- `offset` - Pagination offset
- `search` - Filter by query text or logId
- `status` - Filter by status (all/completed/error)

**Graph Data Response**:
```json
{
  "nodes": [
    {
      "id": "llm-1",
      "type": "llm",
      "name": "llm",
      "icon": "🤖",
      "color": "#8b5cf6",
      "startTime": "2025-11-22T10:00:00Z",
      "endTime": "2025-11-22T10:00:08Z",
      "duration": 8004,
      "status": "completed",
      "metrics": {
        "tokensUsed": 656,
        "modelLatency": 8004
      }
    }
  ],
  "edges": [...],
  "metadata": {
    "startTime": "2025-11-22T10:00:00Z",
    "totalDuration": 41000
  }
}
```

### Error Handling

**Web Fetch 403 Errors**:
- Gracefully handled - returns error message as content
- Pipeline continues with other successful fetches
- Error details visible in tooltips: "Access denied (403 Forbidden) - website blocks automated access"
- Improved User-Agent to reduce blocks

**Retry Logic**:
- Automatic retry with exponential backoff
- Up to 3 attempts per operation
- Retry events logged separately

### Log Data

Logs stored in `./logs/research-combined.log` (JSON format):
- Permanent storage (never deleted)
- Structured JSON with timestamps
- Complete input/output data (no truncation for debugging)
- Grouped by logId for session correlation
- Includes:
  - Tool execution metrics (latency, input/output sizes)
  - LLM token usage (prompt, completion, total)
  - Error context with full stack traces
  - Node lifecycle events (start, complete, error)

For detailed visualization documentation, see [docs/VISUALIZATION_FEATURES.md](docs/VISUALIZATION_FEATURES.md)

## Testing

### Run All Tests
```bash
npm test
```

### Unit Tests
```bash
npm test -- --testPathPattern=spec.ts
```

### Integration Tests
```bash
npm test -- --testPathPattern=integration.spec.ts
```

### Test Coverage
```bash
npm run test:cov
```

Coverage reports are generated in the `coverage/` directory.

### Watch Mode
```bash
npm run test:watch
```

## Project Structure

```
src/
├── config/                 # Configuration module
│   ├── config.module.ts
│   └── environment.validation.ts
├── health/                 # Health check endpoint
│   ├── health.controller.ts
│   └── health.module.ts
├── llm/                    # LLM integration layer
│   ├── interfaces/
│   │   ├── chat-message.interface.ts
│   │   └── chat-response.interface.ts
│   ├── llm.module.ts
│   └── ollama.service.ts
├── logging/                # Structured logging
│   ├── interfaces/
│   │   └── log-entry.interface.ts
│   ├── logging.module.ts
│   └── research-logger.service.ts
├── research/               # Core research pipeline
│   ├── dto/
│   │   ├── research-query.dto.ts
│   │   └── research-response.dto.ts
│   ├── interfaces/
│   │   ├── research-result.interface.ts
│   │   ├── stage-context.interface.ts
│   │   └── stage-result.interface.ts
│   ├── pipeline-executor.service.ts
│   ├── research.controller.ts
│   ├── research.module.ts
│   └── research.service.ts
├── tools/                  # Pluggable tool system
│   ├── interfaces/
│   │   ├── search-result.interface.ts
│   │   ├── tool-definition.interface.ts
│   │   └── tool.interface.ts
│   ├── providers/
│   │   ├── tavily-search.provider.ts
│   │   └── web-fetch.provider.ts
│   ├── registry/
│   │   └── tool-registry.service.ts
│   └── tools.module.ts
├── app.module.ts           # Root application module
└── main.ts                 # Application entry point

test/                       # Test files (mirrors src/ structure)
logs/                       # Application logs (gitignored)
coverage/                   # Test coverage reports (gitignored)
```

## Architecture Deep Dive

### 3-Stage Research Pipeline

**Stage 1: Query Analysis & Search**
- LLM analyzes the user query to understand intent and scope
- Generates 2-3 targeted search queries for comprehensive coverage
- Uses Tavily API to perform web searches
- Returns search results with titles, URLs, content snippets, and relevance scores

**Stage 2: Source Selection & Fetch**
- LLM evaluates search results and selects 3-5 most relevant sources
- Uses web fetch tool to retrieve full content from selected URLs
- Parses HTML and extracts clean text content
- Returns complete content for synthesis

**Stage 3: Synthesis & Answer Generation**
- LLM synthesizes information from all retrieved sources
- Generates comprehensive answer with proper citations
- Organizes information clearly with source attribution
- Returns final answer with metadata

### Pluggable Tool System

The tool system uses OpenAI-compatible function calling format:

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

**Available Tools**:
- `tavily_search`: Web search using Tavily API
- `web_fetch`: Fetch and parse web content

**Adding New Tools**:
1. Implement the `ITool` interface
2. Define tool schema in OpenAI format
3. Implement `execute(args)` method
4. Register in `ToolRegistry` via `ResearchService`

### Structured Logging

All operations are logged with structured JSON format:

```typescript
{
  timestamp: "2025-01-19T12:00:00.000Z",
  logId: "uuid-v4",
  stage: 1,
  component: "pipeline",
  operation: "stage_input",
  input: {...},
  executionTime: 1234
}
```

**Log Files**:
- `logs/research-combined.log`: All log levels
- `logs/research-error.log`: Error-level logs only
- Console output in non-production environments

### Error Handling & Retry Logic

- **Exponential Backoff**: 3 retries with 1s, 2s, 4s delays
- **Circuit Breaking**: Prevents cascading failures
- **Graceful Degradation**: Service continues with reduced functionality
- **Error Context**: Full error context preserved in logs

## Development

### Code Style
```bash
# Format code
npm run format

# Lint code
npm run lint
```

### Debug Mode
```bash
npm run start:debug
```

Debugger listens on `ws://127.0.0.1:9229`. Attach your IDE debugger to this port.

### Environment-Specific Configurations

**Development**:
- Console logging enabled
- Detailed error messages
- Debug mode available

**Production**:
- File logging only
- Error sanitization
- Performance optimizations

## Troubleshooting

### Ollama Connection Issues

**Error**: `Cannot connect to Ollama`

**Solution**:
1. Verify Ollama is running: `ollama list`
2. Check the base URL in `.env`: `OLLAMA_BASE_URL=http://localhost:11434`
3. Test Ollama directly: `ollama run qwen2.5 "Hello"`

### Tavily API Issues

**Error**: `Tavily search failed`

**Solution**:
1. Verify API key is set in `.env`
2. Check API key is valid at [tavily.com](https://tavily.com)
3. Review API rate limits and quotas

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solution**:
1. Change port in `.env`: `PORT=3001`
2. Or kill the process using port 3000:
```bash
lsof -ti:3000 | xargs kill -9
```

### Test Failures

**Error**: Tests failing with timeout

**Solution**:
1. Ensure Ollama is running during integration tests
2. Increase Jest timeout in `package.json`
3. Check network connectivity for API calls

## Next Priority: Evaluation Mechanism (Phase 3)

### Automated Quality Scoring
Implementing comprehensive evaluation system for research quality assessment.

**5-Dimensional Scoring Framework**:
1. **Relevance Score** (30%): How well the answer addresses the query
2. **Completeness Score** (25%): Coverage depth and multiple perspectives
3. **Accuracy Score** (25%): Factual correctness and source verification
4. **Source Quality Score** (15%): Authority, recency, credibility of sources
5. **Coherence Score** (5%): Logical flow, organization, readability

**Features**:
- LLM-based evaluation of each dimension
- Parallel scoring for efficiency
- Evidence-based confidence levels
- Automated improvement recommendations
- Visual dashboard with radar charts
- Token cost analysis per query
- Comparative scoring across sessions

**Value**:
- Optimize prompts based on quality metrics
- Identify systematic weaknesses in pipeline
- Track improvement over time
- Cost/benefit analysis for different strategies

## Future Enhancements

- [ ] **Real-time Graph Visualization** (Phase 4): Live monitoring with force-directed graphs and SSE
- [ ] **Advanced Source Filtering**: Implement relevance scoring and deduplication
- [ ] **Caching Layer**: Add Redis cache for search results and fetched content
- [ ] **Multi-Language Support**: Extend to non-English queries
- [ ] **Alternative LLM Providers**: Support OpenAI, Anthropic, and other providers
- [ ] **Alternative Search Providers**: Playwright-based web scraping, Bing API, Google Custom Search
- [ ] **RAG Integration**: Vector database for improved context retrieval
- [ ] **Rate Limiting**: API rate limiting and quota management
- [ ] **Authentication**: User authentication and API key management
- [ ] **Batch Processing**: Support multiple queries in single request
- [ ] **Result Export**: Export results to PDF, Markdown, or JSON
- [ ] **Custom Tool Development**: Plugin system for custom tool integration

## Performance Benchmarks

Typical execution times (local Ollama, Tavily API):
- Query Analysis (Stage 1): 3-5 seconds
- Content Fetch (Stage 2): 4-7 seconds
- Synthesis (Stage 3): 2-4 seconds
- **Total**: 9-16 seconds per query

Optimization opportunities:
- Parallel tool execution
- Response streaming
- Result caching
- Connection pooling

## License

MIT

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Support

For issues and questions:
- Create an issue on GitHub
- Review existing documentation
- Check troubleshooting section

## Acknowledgments

- Built with [NestJS](https://nestjs.com)
- Powered by [Ollama](https://ollama.ai) and [Tavily](https://tavily.com)
- Inspired by multi-agent research systems
