# Research Agent Visualization Features

## Overview

The Research Agent includes comprehensive debugging and visualization tools to help understand and optimize the agentic research pipeline.

## Timeline Graph Visualization (Phase 2 - Completed)

### Features

#### 1. **Gantt Chart Timeline View**
- Visual timeline showing execution flow from start to finish
- Three types of nodes displayed:
  - **Stage Nodes** (⚙️ blue bars): Pipeline stages (Analysis, Fetch, Synthesis)
  - **Tool Nodes** (🔧 green dots): Tool executions (tavily_search, web_fetch)
  - **LLM Nodes** (🤖 purple dots): Language model calls with token counts

#### 2. **Interactive Hover Tooltips**

**Quick Preview (Hover)**:
- Hover over any node (stage bar or tool/LLM dot)
- Instant tooltip with:
  - Node name and icon
  - Execution status (completed/running/error)
  - Duration/latency
  - Input parameters
  - Output results (truncated to 300-500 chars)
  - Performance metrics

**Pinned Tooltips (Click)**:
- Click any node to "pin" the tooltip
- Tooltip remains visible with:
  - 📌 Pinned indicator
  - Blue border (2px solid)
  - Interactive scrollbars for long content
  - Close button (×) to unpin
- Allows:
  - Moving mouse over tooltip without it disappearing
  - Scrolling through full input/output data
  - Selecting and copying text
  - Reading detailed error messages

**Tooltip Controls**:
- **Hover**: Temporary tooltip, follows cursor
- **Click**: Pin tooltip, make it interactive
- **Click again**: Unpin tooltip
- **Click ×**: Close pinned tooltip
- **Click different node**: Switch pinned tooltip to new node

#### 3. **Node Details Panel**
- Click any node to open detailed side panel
- Shows complete information:
  - Node type, status, timing
  - Full input data (formatted JSON)
  - Full output data (formatted JSON)
  - Error messages (if any)
  - Complete metrics (tokens, latency, sizes)

#### 4. **Zoom and Pan Controls**
- **Zoom In** (🔍+): Magnify timeline
- **Zoom Out** (🔍−): Zoom out for overview
- **Reset** (⟲): Return to default view
- **Mouse wheel**: Zoom in/out
- **Drag**: Pan across timeline

#### 5. **View Modes**
- **Gantt Chart**: Timeline bars showing execution spans
- **Timeline**: Simplified event-based view
- **Dependencies**: Focus on node relationships

### Node Types and Metrics

#### Stage Nodes (⚙️ Blue)
- Represent pipeline stages (1-3)
- Show stage duration and status
- Container for tool and LLM nodes

#### Tool Nodes (🔧 Green)
**tavily_search**:
- Input: Search query with parameters
- Output: Search results array (titles, URLs, scores)
- Metrics: Tool latency (e.g., 1.3s)

**web_fetch**:
- Input: Target URL
- Output: Page title and content (5000 char limit)
  - OR error message (e.g., "403 Forbidden - website blocks automated access")
- Metrics: Tool latency (e.g., 104ms)
- Graceful error handling: Failed fetches return error messages instead of crashing

#### LLM Nodes (🤖 Purple)
- Represent language model calls
- Input: Messages and context
- Output: Generated response
- **Metrics**:
  - **Tokens Used**: Total tokens (prompt + completion)
    - Stage 1: ~650 tokens
    - Stage 2: ~3,000 tokens
    - Stage 3: ~4,800 tokens
  - **Model Latency**: LLM execution time
  - Model: qwen2.5

### Error Handling

**403 Forbidden Errors**:
- Websites blocking automated access are handled gracefully
- web_fetch returns error message as content
- Pipeline continues with other successful fetches
- Error details visible in tooltips and detail panel

**Retry Logic**:
- Automatic retry with exponential backoff
- Up to 3 attempts per operation
- Retry events logged separately

### Performance Metrics

**Typical Research Query** (Denmark example):
- Total execution: 41s
- Stage 1 (Search): 6s
  - 3 tavily_search calls: ~1s each
  - LLM: 656 tokens
- Stage 2 (Fetch): 7s
  - 5 web_fetch calls: 0.1s - 1.8s
  - LLM: 2,974 tokens
- Stage 3 (Synthesis): 23s
  - LLM: 4,831 tokens

**Token Consumption**:
- Average query: ~8,500 tokens total
- Stage 3 uses most tokens (synthesis)
- Scales with content length and complexity

## Usage

### Accessing Visualizations

1. Navigate to **http://localhost:4200/logs**
2. Select a research session from the list
3. Switch between views:
   - **📋 Timeline View**: Hierarchical stage/tool breakdown
   - **📊 Graph View**: Visual timeline with metrics

### Debugging Workflow

1. **Identify slow stages**: Look for long bars in timeline
2. **Check tool failures**: Red dots indicate errors, hover for details
3. **Review token usage**: Check purple LLM dots for token counts
4. **Inspect tool outputs**: Click or pin tooltips to read full content
5. **Compare executions**: Switch between sessions to compare performance

### Best Practices

- **Pin tooltips** when reading long error messages or output content
- **Use zoom** to focus on specific time ranges
- **Check web_fetch errors** to identify blocked websites
- **Monitor token usage** to optimize prompts and reduce costs
- **Review tool latencies** to identify network issues

## Technical Implementation

### Frontend
- **Framework**: Angular 20.2.0
- **Visualization**: D3.js v7
- **State Management**: Angular signals
- **Styling**: SCSS with BEM methodology

### Backend
- **API Endpoints**:
  - `GET /api/logs/sessions` - List all sessions
  - `GET /api/logs/sessions/:logId` - Session details
  - `GET /api/logs/graph/:logId` - Graph data
- **Data Format**: GraphData with nodes, edges, metadata
- **Metrics**: Structured logging with Winston

### Data Flow
1. Pipeline execution logs events to Winston
2. Logs stored in research-combined.log
3. API reads logs and transforms to graph structure
4. Frontend fetches graph data via HTTP
5. D3.js renders visualization
6. User interactions trigger tooltips and detail panels

## Phase 3: Real-time SSE & Token Cost Dashboard (Completed)

### Real-time SSE Updates (Completed)
Server-Sent Events (SSE) implementation for live monitoring during research execution.

**Features:**
- Live updates via Server-Sent Events (SSE) at `/api/research/stream/:logId`
- Real-time event streaming for all pipeline stages
- Automatic replay of existing logs on connection
- Tool call events (started, completed, failed)
- Phase lifecycle events (started, completed, failed)
- Milestone events for granular progress tracking
- Evaluation events (started, completed, failed)

**Backend Implementation:**
- **Controller**: `src/research/research-stream.controller.ts`
- **Endpoint**: `@Sse('stream/:logId')` - SSE stream for real-time events
- **Event Types**: 40+ event types including session, planning, phase, step, tool, milestone, and evaluation events
- **Event Emitter**: Uses `@nestjs/event-emitter` for pub/sub pattern
- **Existing Log Replay**: Sends historical logs on new connection for session recovery

**Frontend Integration:**
- **Service**: `client/src/app/core/services/agent-activity.service.ts`
- **EventSource API**: Native browser SSE support
- **Connection Management**: Automatic reconnection handling

### Token Cost Dashboard (Completed)
Visual dashboard for monitoring token usage, cost estimates, and execution metrics.

**Features:**
- **Total Token Count**: Aggregated token usage across all tools
- **Cost Estimation**: Approximate cost calculation based on token usage
- **Token Breakdown by Tool**: Visual bar chart showing token distribution per tool
  - Color-coded bars (Tavily Search, Web Fetch, DuckDuckGo, Brave, LLM, etc.)
  - Percentage breakdown of total usage
- **Token-Heavy Steps**: Top 3 most token-consuming steps with tool icons
- **Duration by Phase**: Breakdown of execution time per phase

**Component:**
- **Location**: `client/src/app/shared/components/token-cost-card/token-cost-card.ts`
- **Integration**: Part of Research Quality Inspector dashboard
- **Data Model**: `client/src/app/models/execution-metrics.model.ts`

**Metrics Endpoint:**
- **Backend**: `src/logging/logs.controller.ts` - `/api/logs/sessions/:logId/metrics`
- **Response**: ExecutionMetrics with tokenBreakdown, durationByPhase, slowestSteps, tokenHeavySteps

**Model Structure:**
```typescript
interface ExecutionMetrics {
  totalDurationMs: number;
  tokenBreakdown: Record<string, number>;
  durationByPhase: Record<string, number>;
  durationByTool: Record<string, number>;
  slowestSteps: StepMetric[];
  tokenHeavySteps: TokenMetric[];
}
```

## Phase 4: Animated Knowledge Graph Visualization (Completed)

### Overview
Interactive force-directed graph visualization showing research execution flow with animated effects for real-time monitoring. Integrates seamlessly with the Research Quality Inspector dashboard. Styled with the Digital Hygge design system for a warm, approachable visual experience.

### Features

#### 1. **Force-Directed Knowledge Graph**
- **D3.js v7.9.0**: Force simulation with collision detection and link forces
- **Interactive Controls**: Drag nodes, zoom (0.5x-5x), pan across canvas
- **Auto-Layout**: Intelligent node positioning with force equilibrium
- **Digital Hygge Design**: Warm stone/oatmeal background with accessible color palette

#### 2. **Animated Visual Effects**

**Particle Flow Animation**:
- Animated particles flowing along edges showing data flow direction
- Configurable particle count and speed
- Color-coded particles matching source node colors
- Stone-colored edges (#a8a29e) for visual harmony

**Pulsing Glow Rings**:
- Active/running nodes display animated pulsing glow rings
- SVG filter-based glow effects for smooth rendering
- Visual distinction between active and completed states
- Moss green highlights (#4d7c0f) for active nodes

#### 3. **Node Types and Visual Encoding (Digital Hygge Palette)**

| Node Type | Icon | Color | Description |
|-----------|------|-------|-------------|
| Stage | - | #4d7c0f (moss green) | Pipeline stage nodes |
| Tool | Tool-specific | #64748b (slate) | Tool execution nodes |
| LLM | Robot icon | #7c3aed (violet) | Language model call nodes |
| Retry | Refresh icon | #ea580c (clay) | Retry attempt nodes |

**Tool Icon Mapping**:
- `web_fetch`: Globe icon
- `tavily_search`: Search icon
- `duckduckgo_search`: Search icon
- `brave_search`: Search icon
- `llm`: Robot icon
- Default: Cog icon

#### 4. **Status Indicators (Digital Hygge Aligned)**

| Status | Color | Animation |
|--------|-------|-----------|
| Pending | Stone (#a8a29e) | None |
| Running | Moss green (#4d7c0f) | Pulsing glow ring |
| Completed | Moss green (#4d7c0f) | None |
| Error | Clay (#ea580c) | None |

**Visual Theme**:
- **Background**: Warm oatmeal tone (#faf6f1 or similar)
- **Primary Node Colors**: Moss green (#4d7c0f), slate (#64748b), violet (#7c3aed), clay (#ea580c)
- **Edge Colors**: Stone (#a8a29e)
- **Text Colors**: Charcoal on light backgrounds for optimal contrast

#### 5. **Interactive Tooltips**
Hover over any node to see detailed information:
- Node name and type
- Execution status
- Duration (formatted as ms, s, or m)
- Start/end timestamps
- Status-specific styling

#### 6. **Control Panel**
Located in the top-right corner with Digital Hygge styling:
- **Zoom In** (+): Increase zoom level
- **Zoom Out** (-): Decrease zoom level
- **Reset View**: Return to default zoom and center
- **Toggle Animations**: Enable/disable particle effects for performance
- **Styling**: Oatmeal background with moss green accent buttons for intuitive interaction

#### 7. **Legend**
Visual legend showing:
- Node type indicators with Digital Hygge colors (stage: moss green, tool: slate, LLM: violet, retry: clay)
- Status color coding with labels
- Light background with clear contrast for accessibility

### Component Architecture

**KnowledgeGraphComponent** (`/client/src/app/shared/components/knowledge-graph/knowledge-graph.ts`):
```typescript
@Component({
  selector: 'app-knowledge-graph',
  standalone: true,
  // ...
})
export class KnowledgeGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() graphData!: GraphData;

  // Features:
  // - Force simulation with D3.js
  // - SVG filters for glow effects
  // - Animated particle system
  // - Drag, zoom, pan interactions
  // - Responsive tooltip system
  // - Performance-optimized rendering
}
```

**GraphBuilderService** (`/client/src/app/core/services/graph-builder.service.ts`):
```typescript
@Injectable({ providedIn: 'root' })
export class GraphBuilderService {
  buildGraphFromLogs(logs: LogDetail): GraphData;
  // Converts LogDetail entries into GraphData structure
  // Processes: planning, phase, step, evaluation events
  // Maps tool names to icons and colors
  // Creates hierarchical graph: session -> phases -> steps
}
```

### Integration in Research Quality Inspector

The knowledge graph is integrated into the Research Quality Inspector dashboard:

**Location**: Research Quality Inspector > "Research Flow Visualization" section

**Toggle Button**: Click to show/hide the visualization

**Reactive Updates**: Graph updates automatically when new log data is loaded

**Template Integration**:
```html
<section class="research-quality-inspector__section">
  <h3>Research Flow Visualization</h3>
  <button (click)="toggleGraph()">
    {{ showGraph() ? 'Hide' : 'Show' }} Knowledge Graph
  </button>
  @if (showGraph() && logDetail()) {
    <app-knowledge-graph [graphData]="graphData()" />
  }
</section>
```

### Performance Considerations

**Animation Toggle**: Disable particle animations for better performance on lower-end devices

**Force Simulation**: Automatically stops after equilibrium reached (alpha < 0.001)

**SVG Optimization**: Uses SVG filters for glow effects instead of canvas for better quality

**Lazy Rendering**: Graph only renders when toggled visible

### Technical Implementation Details

**Digital Hygge Design System Compliance**:
- **Color Palette**: Warm stone (#a8a29e), moss green (#4d7c0f), slate (#64748b), violet (#7c3aed), clay (#ea580c)
- **Background**: Warm oatmeal tones (#faf6f1) for inviting, comfortable appearance
- **Typography**: High contrast charcoal text on light backgrounds for readability
- **Visual Harmony**: Muted earth tones with selective accent colors for visual hierarchy
- **Accessibility**: WCAG AA compliant color contrasts with inclusive design principles

**SVG Filters**:
```xml
<filter id="glow">
  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
  <feMerge>
    <feMergeNode in="coloredBlur"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>

<!-- Edge gradient using Digital Hygge stone colors -->
<linearGradient id="edge-gradient" gradientUnits="userSpaceOnUse">
  <stop offset="0%" stop-color="#a8a29e" stop-opacity="0.3"/>
  <stop offset="50%" stop-color="#78716c" stop-opacity="0.6"/>
  <stop offset="100%" stop-color="#a8a29e" stop-opacity="0.3"/>
</linearGradient>
```

**Particle Animation**: Uses `requestAnimationFrame` for smooth 60fps particle movement along edge paths with Digital Hygge-colored particles

**Force Simulation Parameters**:
- Link distance: 100px
- Charge strength: -300
- Collision radius: 50px
- Center force: Canvas center
- Edge color: Stone (#a8a29e) for subtle visual flow

## Future Enhancements (Phase 5+)

### Additional Features (Planned)
- Graph view mode persistence
- Export timeline as PNG/SVG
- Performance comparison across sessions
- Custom time range filtering
- Search/filter within graph nodes
- Real-time SSE integration for live graph updates
- Multi-session graph comparison

## Troubleshooting

### Tooltips Not Appearing
- Ensure frontend is built and served from latest code
- Check browser console for JavaScript errors
- Verify ChangeDetectorRef is triggering view updates

### Missing LLM Nodes
- Verify LLM calls are being logged (check research-combined.log)
- Ensure backend has restarted after code changes
- Check that operation='chat' entries exist in log file

### Web Fetch Failures
- 403 errors are normal for sites blocking automation
- Check tooltip content for specific error messages
- Consider alternative sources if many fetches fail
- Update User-Agent if necessary

## API Documentation

### Graph Data Structure

```typescript
interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    startTime?: Date;
    endTime?: Date;
    totalDuration?: number;
  };
}

interface GraphNode {
  id: string;
  type: 'stage' | 'tool' | 'llm' | 'retry';
  name: string;
  icon: string;
  color: string;
  size: 'small' | 'medium' | 'large';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  parentId?: string;
  childrenIds: string[];
  dependsOn: string[];
  input?: any;
  output?: any;
  error?: string;
  metrics?: NodeMetrics;
}

interface NodeMetrics {
  tokensUsed?: number;      // Total tokens (LLM only)
  latency?: number;          // Generic latency
  modelLatency?: number;     // LLM execution time
  toolLatency?: number;      // Tool execution time
  retryCount?: number;       // Number of retries
  cacheHit?: boolean;        // Cache hit indicator
}
```

## Changelog

### 2025-12-02 - Phase 4 Update (Digital Hygge Design System Compliance)
- ✅ Updated Knowledge Graph visualization to follow Digital Hygge design system
- ✅ Background changed from dark gradient to warm stone/oatmeal tones
- ✅ Node colors updated to Digital Hygge palette:
  - Stage nodes: moss green (#4d7c0f)
  - Tool nodes: slate (#64748b)
  - LLM nodes: violet (#7c3aed)
  - Retry nodes: clay (#ea580c)
- ✅ Status colors aligned with design system (stone for pending, moss green for running/completed, clay for error)
- ✅ Controls, legend, and tooltips updated to light theme
- ✅ Edge colors changed to stone (#a8a29e) for visual harmony
- ✅ Section header updated with oatmeal background and moss green button
- ✅ Documentation updated to reflect Digital Hygge compliance

### 2025-12-02 - Phase 4 Complete (Animated Knowledge Graph)
- ✅ Force-directed knowledge graph visualization with D3.js v7.9.0
- ✅ Animated particle effects flowing along edges
- ✅ Pulsing glow rings for running/active nodes
- ✅ SVG filters for smooth glow effects
- ✅ Interactive drag, zoom (0.5x-5x), and pan controls
- ✅ Tooltips with node details (timing, status, duration)
- ✅ Control panel (zoom in/out, reset view, toggle animations)
- ✅ Legend showing node types and status indicators
- ✅ GraphBuilderService for converting logs to graph data
- ✅ Integration in Research Quality Inspector dashboard
- ✅ Tool icon and color mapping (web_fetch, tavily_search, llm, etc.)
- ✅ Hierarchical graph structure: session -> phases -> steps

### 2025-12-02 - Phase 3 Complete
- ✅ Real-time SSE endpoint fully implemented (`/api/research/stream/:logId`)
- ✅ 40+ event types for comprehensive real-time monitoring
- ✅ Existing log replay on SSE connection
- ✅ Token Cost Dashboard component integrated
- ✅ Token breakdown by tool with visual bar charts
- ✅ Cost estimation based on token usage
- ✅ Token-heavy steps identification
- ✅ Duration by phase metrics
- ✅ Research Quality Inspector dashboard integration

### 2025-11-22 - Phase 2 Complete
- ✅ Timeline graph visualization with D3.js
- ✅ Gantt chart view with zoom/pan
- ✅ Interactive hover tooltips
- ✅ Pinned tooltips for detailed inspection
- ✅ LLM nodes with token counts
- ✅ Tool metrics (latency, input/output sizes)
- ✅ Graceful web_fetch error handling
- ✅ Stage 2 prompt enhancement (forces tool usage)
- ✅ Comprehensive debugging capabilities

### 2025-11-21 - Phase 1 Complete
- ✅ Enhanced data models for node lifecycle tracking
- ✅ Token count logging for LLM calls
- ✅ Tool execution metrics
- ✅ Backend API endpoints for graph data
- ✅ SSE infrastructure foundation for real-time updates
