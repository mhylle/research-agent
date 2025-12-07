# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-stage LLM research agent that orchestrates web search and content synthesis. Built with NestJS 11.x backend + Angular 20.x frontend, with pluggable LLM providers (Ollama or Azure Mistral) and Tavily for web search.

**3-Stage Pipeline**: Query Analysis → Source Selection & Fetch → Answer Synthesis (9-16s total)

## Common Commands

```bash
# Development (runs both backend:3000 and frontend:4200)
npm run dev

# Backend only
npm run start:dev          # Watch mode with hot reload
npm run start:debug        # Debug mode (ws://127.0.0.1:9229)

# Frontend only
npm run client:dev         # or: cd client && ng serve

# Testing
npm test                   # Unit tests (Jest)
npm run test:watch         # Watch mode
npm run test:cov           # Coverage report
npm run test:e2e           # E2E tests (requires Ollama + API keys)
npm run client:test        # Angular tests (Karma/Jasmine)

# Code quality
npm run lint               # ESLint with auto-fix
npm run format             # Prettier

# Database migrations (manual - NOT automatic on startup)
npm run migration:generate src/migrations/DescriptiveName
npm run migration:run
npm run migration:revert

# Docker
docker-compose up -d postgres   # Start PostgreSQL
npm run docker:up              # Full stack
npm run docker:logs            # View logs
```

## Architecture

### Backend (NestJS) - `src/`

**Module Structure**: Each feature is a self-contained NestJS module with controllers/services/entities:
- `research/` - Core 3-stage pipeline (research.controller.ts, research-stream.controller.ts for SSE)
- `tools/` - Pluggable tool system with registry (tavily_search, web_fetch, brave_search, etc.)
- `executors/` - Tool/LLM execution layer with registry pattern
- `llm/` - LLM provider abstraction (providers/ollama.provider.ts, providers/azure-mistral.provider.ts, llm.service.ts)
- `logging/` - Winston structured JSON logging
- `orchestration/` - Complex multi-step orchestration
- `reasoning/`, `reflection/`, `evaluation/` - Advanced agent capabilities

**Key Patterns**:
- Tool interface: `ITool { name, schema, execute(args) }`
- Executor registry maps names to executor instances
- SSE for real-time progress (`/api/research/stream/:logId`)
- TypeORM entities for persistence (LogEntry, ResearchResult, EvaluationRecord)

### Frontend (Angular) - `client/`

**Standalone Components Architecture**:
- `features/research/` - Main research UI with chat interface
- `features/logs/` - Session logs and D3.js graph visualization
- `features/evaluation-dashboard/` - Quality inspection with animated knowledge graph
- `core/services/` - API, graph builder, SSE connection management
- `shared/components/` - Reusable components (knowledge-graph with D3.js force-directed)

**State Management**: Angular Signals (reactive state)

### API Endpoints

- `POST /api/research/query` - Submit query, returns logId
- `GET /api/research/stream/:logId` - SSE real-time progress
- `POST /api/research/retry/:logId/:nodeId` - Retry failed task
- `GET /api/logs/sessions` - List sessions (paginated)
- `GET /api/logs/graph/:logId` - Graph visualization data
- `GET /api/health` - Health check

## Key Conventions

- **One class/interface per file** - enforced throughout codebase
- **Migrations are manual** - always run `npm run migration:run` before starting
- **Error handling** - try-catch with context preservation, graceful 403 degradation
- **Logging** - structured JSON to `logs/research-combined.log` and `logs/research-error.log`

## Environment Setup

Required in `.env`:
```bash
# Search API (required)
TAVILY_API_KEY=your_key

# LLM Provider Selection
LLM_PROVIDER=ollama            # Options: 'ollama', 'azure-mistral'

# Ollama Configuration (when LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5

# Azure Mistral Configuration (when LLM_PROVIDER=azure-mistral)
AZURE_OPENAI_ENDPOINT=https://your-resource.services.ai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=your_key
AZURE_MISTRAL_MODEL=Mistral-Large-3

# Database
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=research_agent
DB_PASSWORD=your_password
DB_DATABASE=research_agent_db
```

### LLM Provider Switching

Switch providers at runtime by changing `LLM_PROVIDER`:
- **ollama** (default): Uses local Ollama server, requires `ollama serve` running
- **azure-mistral**: Uses Azure Mistral-Large-3 API, requires Azure credentials

## Development Workflow

1. Start PostgreSQL: `docker-compose up -d postgres`
2. Start Ollama: `ollama serve` (separate terminal)
3. Run migrations: `npm run migration:run`
4. Start dev: `npm run dev`

## Code Style

- Single quotes, trailing commas (Prettier)
- TypeScript strict null checks enabled
- Angular: 100 char line width, SCSS, BEM methodology
