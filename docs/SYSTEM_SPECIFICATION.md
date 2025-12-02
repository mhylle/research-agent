# Research Agent - System Specification

**Last Updated**: 2025-12-02
**Document Purpose**: Reference for implemented services, tools, and components for the service delegation pattern

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Angular Frontend                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Research    │  │ Logs Page    │  │ Evaluation Dashboard   │  │
│  │ Component   │  │ + Timeline   │  │ + Quality Inspector    │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│                            │ SSE / REST                          │
└────────────────────────────┼────────────────────────────────────┘
                             │
┌────────────────────────────┼────────────────────────────────────┐
│                      NestJS Backend                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Controllers Layer                        │ │
│  │  research.controller │ logs.controller │ evaluation.controller│
│  │  research-stream.controller (SSE)                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                             │                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                 Orchestration Layer                         │ │
│  │  orchestrator.service │ planner.service │ milestone.service │ │
│  │  event-coordinator.service │ step-configuration.service    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                             │                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   Service Layer                             │ │
│  │  research.service │ pipeline-executor.service              │ │
│  │  evaluation.service │ answer-evaluator.service              │ │
│  │  retrieval-evaluator.service │ score-aggregator.service    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                             │                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Tools Layer                             │ │
│  │  tool-registry.service                                      │ │
│  │  ├── tavily-search.provider                                 │ │
│  │  ├── brave-search.provider                                  │ │
│  │  ├── duckduckgo-search.provider                            │ │
│  │  ├── serpapi-search.provider                               │ │
│  │  ├── web-fetch.provider                                    │ │
│  │  └── knowledge-search.provider                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                             │                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                Infrastructure Layer                         │ │
│  │  ollama.service │ research-logger.service │ log.service    │ │
│  │  embedding.service │ knowledge-search.service              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                             │                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Database Layer                           │ │
│  │  PostgreSQL 16 + TypeORM                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend Services

### Controllers (`src/*/*.controller.ts`)

| Controller | Route | Purpose |
|------------|-------|---------|
| `research.controller` | `/api/research` | Research query submission |
| `research-stream.controller` | `/api/research/stream/:logId` | SSE real-time event streaming |
| `research-result.controller` | `/api/research/result/:logId` | Fetch research results |
| `logs.controller` | `/api/logs` | Log sessions and detail retrieval |
| `evaluation.controller` | `/api/evaluation` | Evaluation triggers and results |
| `health.controller` | `/api/health` | Health check endpoint |

### Orchestration Services (`src/orchestration/services/`)

| Service | File | Purpose |
|---------|------|---------|
| `OrchestratorService` | `orchestrator.service.ts` | Main pipeline orchestration |
| `PlannerService` | `planner.service.ts` | Research plan generation |
| `MilestoneService` | `milestone.service.ts` | Progress milestone tracking |
| `EventCoordinatorService` | `event-coordinator.service.ts` | Event emission coordination |
| `StepConfigurationService` | `step-configuration.service.ts` | Pipeline step configuration |
| `EvaluationCoordinatorService` | `evaluation-coordinator.service.ts` | Evaluation workflow coordination |
| `ResultExtractorService` | `result-extractor.service.ts` | Extract results from pipeline |

### Evaluation Services (`src/evaluation/services/`)

| Service | File | Purpose |
|---------|------|---------|
| `EvaluationService` | `evaluation.service.ts` | Main evaluation orchestration |
| `AnswerEvaluatorService` | `answer-evaluator.service.ts` | Answer quality evaluation |
| `RetrievalEvaluatorService` | `retrieval-evaluator.service.ts` | Source retrieval evaluation |
| `ScoreAggregatorService` | `score-aggregator.service.ts` | Score aggregation and weighting |
| `ResultClassifierService` | `result-classifier.service.ts` | Result type classification |
| `PanelEvaluatorService` | `panel-evaluator.service.ts` | Panel-based evaluation |
| `PlanEvaluationOrchestratorService` | `plan-evaluation-orchestrator.service.ts` | Plan quality evaluation |
| `EscalationHandlerService` | `escalation-handler.service.ts` | Handle low-quality escalations |

### Research Services (`src/research/`)

| Service | File | Purpose |
|---------|------|---------|
| `ResearchService` | `research.service.ts` | Main research execution |
| `PipelineExecutorService` | `pipeline-executor.service.ts` | 3-stage pipeline execution |
| `ResearchResultService` | `research-result.service.ts` | Result storage and retrieval |

### Tool Providers (`src/tools/providers/`)

| Provider | File | Purpose |
|----------|------|---------|
| `TavilySearchProvider` | `tavily-search.provider.ts` | Tavily API web search |
| `BraveSearchProvider` | `brave-search.provider.ts` | Brave Search API |
| `DuckDuckGoSearchProvider` | `duckduckgo-search.provider.ts` | DuckDuckGo search |
| `SerpApiSearchProvider` | `serpapi-search.provider.ts` | SerpAPI Google search |
| `WebFetchProvider` | `web-fetch.provider.ts` | Web content fetching |
| `KnowledgeSearchProvider` | `knowledge-search.provider.ts` | Internal knowledge search |

### Infrastructure Services

| Service | File | Purpose |
|---------|------|---------|
| `OllamaService` | `src/llm/ollama.service.ts` | LLM interaction (qwen2.5) |
| `ResearchLoggerService` | `src/logging/research-logger.service.ts` | Structured research logging |
| `LogService` | `src/logging/log.service.ts` | General logging |
| `LogsService` | `src/logs/logs.service.ts` | Log retrieval and filtering |
| `EmbeddingService` | `src/knowledge/embedding.service.ts` | Text embeddings |
| `KnowledgeSearchService` | `src/knowledge/knowledge-search.service.ts` | Knowledge base search |
| `ToolRegistryService` | `src/tools/registry/tool-registry.service.ts` | Tool registration and lookup |
| `ExecutorRegistryService` | `src/executors/executor-registry.service.ts` | Executor registration |

---

## Frontend Services

### Core Services (`client/src/app/core/services/`)

| Service | File | Purpose |
|---------|------|---------|
| `ResearchService` | `research.service.ts` | Research API calls |
| `LogsService` | `logs.service.ts` | Logs API calls |
| `AgentActivityService` | `agent-activity.service.ts` | SSE connection and state management |
| `EvaluationApiService` | `evaluation-api.service.ts` | Evaluation API calls |
| `GraphBuilderService` | `graph-builder.service.ts` | Log-to-graph data transformation |

---

## Frontend Components

### Research Feature (`client/src/app/features/research/`)

| Component | File | Purpose |
|-----------|------|---------|
| `ResearchComponent` | `research.ts` | Main research page |
| `SearchInputComponent` | `components/search-input/search-input.ts` | Query input field |
| `ResultCardComponent` | `components/result-card/result-card.ts` | Research result display |
| `SourcesListComponent` | `components/sources-list/sources-list.ts` | Source citations list |
| `LoadingIndicatorComponent` | `components/loading-indicator/loading-indicator.ts` | Loading state |
| `ErrorMessageComponent` | `components/error-message/error-message.ts` | Error display |
| `AgentActivityViewComponent` | `components/agent-activity-view/agent-activity-view.component.ts` | Real-time activity view |
| `TaskCardComponent` | `components/task-card/task-card.component.ts` | Individual task display |
| `StageProgressHeaderComponent` | `components/stage-progress-header/stage-progress-header.ts` | Stage progress bar |
| `MilestoneIndicatorComponent` | `components/milestone-indicator/milestone-indicator.component.ts` | Milestone status |
| `ResearchHistoryComponent` | `components/research-history/research-history.component.ts` | Query history |
| `EvaluationDisplayComponent` | `components/evaluation-display/evaluation-display.component.ts` | Evaluation results |

### Logs Feature (`client/src/app/features/logs/`)

| Component | File | Purpose |
|-----------|------|---------|
| `LogsPageComponent` | `logs-page/logs-page.ts` | Main logs page |
| `LogsListComponent` | `components/logs-list/logs-list.ts` | Session list |
| `LogTimelineComponent` | `components/log-timeline/log-timeline.ts` | Timeline tree view |
| `TimelineGraphComponent` | `components/timeline-graph/timeline-graph.ts` | D3.js Gantt chart |
| `StageNodeComponent` | `components/stage-node/stage-node.ts` | Stage display |
| `ToolNodeComponent` | `components/tool-node/tool-node.ts` | Tool display |
| `JsonViewerComponent` | `components/json-viewer/json-viewer.ts` | JSON data viewer |
| `SessionPickerComponent` | `components/session-picker/session-picker.ts` | Session selection |
| `SourceCredibilityComponent` | `components/source-credibility/source-credibility.ts` | Source quality display |
| `ResearchQualityInspectorComponent` | `components/research-quality-inspector/research-quality-inspector.ts` | Quality dashboard |

### Evaluation Dashboard (`client/src/app/features/evaluation-dashboard/`)

| Component | File | Purpose |
|-----------|------|---------|
| `EvaluationDashboardComponent` | `evaluation-dashboard.component.ts` | Evaluation overview |
| `EvaluationListComponent` | `evaluation-list.component.ts` | Evaluation list |
| `EvaluationStatsComponent` | `evaluation-stats.component.ts` | Statistics display |

### Shared Components (`client/src/app/shared/components/`)

| Component | File | Purpose |
|-----------|------|---------|
| `AppHeaderComponent` | `app-header/app-header.ts` | Navigation header |
| `KnowledgeGraphComponent` | `knowledge-graph/knowledge-graph.ts` | Animated D3.js force graph |
| `RadarChartComponent` | `radar-chart/radar-chart.ts` | Evaluation radar chart |
| `SparklineComponent` | `sparkline/sparkline.ts` | Mini trend charts |
| `TokenCostCardComponent` | `token-cost-card/token-cost-card.ts` | Token usage display |
| `QualityTimelineComponent` | `quality-timeline/quality-timeline.component.ts` | Quality over time |

---

## API Endpoints

### Research API

```
POST /api/research/query
  Body: { query: string, maxSources?: number, searchDepth?: string }
  Returns: { logId: string }

GET /api/research/stream/:logId
  Returns: SSE stream (40+ event types)

GET /api/research/result/:logId
  Returns: { answer: string, sources: [], metadata: {} }
```

### Logs API

```
GET /api/logs/sessions
  Query: { limit?, offset?, search?, status? }
  Returns: { sessions: [], total: number }

GET /api/logs/sessions/:logId
  Returns: { entries: [], metadata: {} }

GET /api/logs/graph/:logId
  Returns: { nodes: [], edges: [], metadata: {} }
```

### Evaluation API

```
POST /api/evaluation/evaluate/:logId
  Returns: { dimensions: {}, overallScore: number, recommendations: [] }

GET /api/evaluation/:logId
  Returns: Stored evaluation result
```

### Health API

```
GET /api/health
  Returns: { status: string, services: { ollama: boolean, tavily: boolean } }
```

---

## Key Interfaces

### Research Pipeline

```typescript
// Stage Context (passed through pipeline)
interface StageContext {
  logId: string;
  query: string;
  stage: number;
  previousResults: any[];
}

// Stage Result
interface StageResult {
  stage: number;
  success: boolean;
  data: any;
  executionTime: number;
}
```

### Graph Visualization

```typescript
// Graph Node (for D3.js visualization)
interface GraphNode {
  id: string;
  type: 'session' | 'phase' | 'step' | 'tool';
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  metrics?: NodeMetrics;
}

// Graph Edge
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'parent-child' | 'dependency' | 'data-flow';
}
```

### SSE Events

```typescript
// SSE Event Types (40+ types)
type SSEEventType =
  | 'session_started' | 'session_completed'
  | 'planning_started' | 'planning_completed'
  | 'phase_started' | 'phase_completed'
  | 'step_started' | 'step_completed'
  | 'tool_execution_started' | 'tool_execution_completed'
  | 'milestone_started' | 'milestone_completed'
  | 'evaluation_started' | 'evaluation_completed'
  | 'error';
```

---

## Technology Stack

### Backend
- **Framework**: NestJS 11.x
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL 16 + TypeORM
- **LLM**: Ollama (qwen2.5)
- **Logging**: Winston
- **Validation**: class-validator

### Frontend
- **Framework**: Angular 20.2.0 (standalone components)
- **Language**: TypeScript 5.x
- **State**: Angular Signals
- **Visualization**: D3.js v7.9.0
- **Styling**: SCSS (BEM methodology)

### Development
- **Containerization**: Docker Compose
- **Testing**: Jest (backend), Jasmine/Karma (frontend)
- **Build**: npm, webpack

---

## Service Delegation Pattern

When implementing new features, use this pattern:

1. **Create a new service** in the appropriate layer
2. **Register it** in the relevant module
3. **Inject dependencies** from existing services
4. **Emit events** through `EventCoordinatorService` for real-time updates
5. **Log progress** through `ResearchLoggerService`
6. **Expose via controller** if external access needed

Example:
```typescript
@Injectable()
export class NewFeatureService {
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly researchLogger: ResearchLoggerService,
    private readonly eventCoordinator: EventCoordinatorService,
  ) {}

  async execute(logId: string, data: any): Promise<Result> {
    this.eventCoordinator.emit(logId, 'feature_started', { data });
    this.researchLogger.log(logId, 'feature', 'started', data);

    // Implementation...

    this.eventCoordinator.emit(logId, 'feature_completed', { result });
    this.researchLogger.log(logId, 'feature', 'completed', result);
    return result;
  }
}
```
