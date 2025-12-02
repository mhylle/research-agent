# Research Agent - Enhanced Debugging & Evaluation Implementation Plan

## Overview
This document outlines the implementation plan for advanced debugging visualizations and evaluation mechanisms for the research agent system.

## Priority Order

1. **Phase 1: Enhanced Data Model & Backend** (Foundation) ✅ COMPLETED
2. **Phase 2: Timeline Graph Visualization** (Historical Analysis) ✅ COMPLETED
3. **Phase 3: Real-time SSE & Token Cost Dashboard** ✅ COMPLETED
4. **Phase 4: Animated Knowledge Graph Visualization** ✅ COMPLETED (2025-12-02)
5. **Phase 5: Advanced Features** (Future Enhancements) - Planned
6. **Phase 6: Real-time Live Monitoring** (Live SSE Graph Updates) - Deferred

**Phase 4 Completion Summary (2025-12-02)**:
- ✅ Force-directed knowledge graph visualization with D3.js v7.9.0
- ✅ Animated particle effects flowing along edges
- ✅ Pulsing glow rings for running/active nodes
- ✅ SVG filters for smooth glow effects
- ✅ Interactive drag, zoom (0.5x-5x), and pan controls
- ✅ Tooltips with node details (timing, status, duration)
- ✅ Control panel (zoom in/out, reset view, toggle animations)
- ✅ Legend showing node types and status indicators
- ✅ GraphBuilderService for log-to-graph conversion
- ✅ Integration in Research Quality Inspector dashboard
- ✅ Digital Hygge Design System compliance (warm oatmeal background, moss green/slate/violet/clay palette)

**Phase 3 Completion Summary (2025-12-02)**:
- ✅ SSE endpoint fully implemented (`/api/research/stream/:logId`)
- ✅ 40+ event types for real-time monitoring
- ✅ Token Cost Dashboard with breakdown by tool
- ✅ Cost estimation and token-heavy step identification
- ✅ Research Quality Inspector dashboard integration

---

## Phase 1: Enhanced Data Model & Backend

### 1.1 Enhanced Log Entry Model

**Current State:**
```typescript
interface LogEntry {
  timestamp: string;
  logId: string;
  stage?: number;
  component: string;
  operation: string;
  input?: any;
  output?: any;
  executionTime?: number;
  level: string;
  message: string;
}
```

**Enhanced Model:**
```typescript
interface EnhancedLogEntry extends LogEntry {
  // Node lifecycle tracking
  nodeId: string;              // Unique identifier for this execution node
  parentNodeId?: string;        // Parent node in execution hierarchy
  nodeType: 'stage' | 'tool' | 'llm' | 'retry';

  // Timing information
  startTime: string;            // ISO timestamp when node initialized
  endTime?: string;             // ISO timestamp when node completed
  executionTime?: number;       // Calculated duration (ms)

  // State tracking
  status: 'pending' | 'running' | 'completed' | 'error' | 'retrying';

  // Relationships for graph visualization
  dependencies: string[];       // nodeIds this node depends on
  triggerredBy?: string;        // nodeId that triggered this node

  // Performance metrics
  metrics?: {
    tokensUsed?: number;
    modelLatency?: number;
    toolLatency?: number;
    retryCount?: number;
  };
}
```

### 1.2 Graph Node Model

**Purpose:** Unified model for both timeline and real-time graph visualizations

```typescript
interface GraphNode {
  // Identity
  id: string;                   // Same as nodeId in LogEntry
  type: 'stage' | 'tool' | 'llm' | 'retry';
  name: string;                 // Human-readable name

  // Visual properties
  icon: string;
  color: string;
  size: 'small' | 'medium' | 'large';

  // Lifecycle
  startTime: Date;
  endTime?: Date;
  duration?: number;            // milliseconds
  status: 'pending' | 'running' | 'completed' | 'error' | 'retrying';

  // Relationships
  parentId?: string;
  childrenIds: string[];
  dependsOn: string[];          // For showing dependency edges

  // Position (for force-directed graph)
  x?: number;
  y?: number;

  // Data
  input?: any;
  output?: any;
  error?: string;
  metrics?: NodeMetrics;
}

interface NodeMetrics {
  tokensUsed?: number;
  latency: number;
  retryCount: number;
  cacheHit?: boolean;
}

interface GraphEdge {
  id: string;
  source: string;               // nodeId
  target: string;               // nodeId
  type: 'parent-child' | 'dependency' | 'data-flow' | 'retry';
  label?: string;
  animated?: boolean;           // For real-time visualization
}
```

### 1.3 Backend Changes

#### 1.3.1 Enhanced ResearchLogger Service

**File:** `src/logging/research-logger.service.ts`

```typescript
interface NodeLifecycleEvent {
  nodeId: string;
  parentNodeId?: string;
  nodeType: 'stage' | 'tool' | 'llm' | 'retry';
  event: 'start' | 'progress' | 'complete' | 'error';
  timestamp: string;
  data?: any;
}

@Injectable()
export class ResearchLogger {
  private activeNodes = new Map<string, NodeLifecycleEvent>();
  private eventEmitter = new EventEmitter();

  // New methods for node lifecycle tracking
  nodeStart(nodeId: string, type: string, parentId?: string): void;
  nodeProgress(nodeId: string, progress: any): void;
  nodeComplete(nodeId: string, result: any): void;
  nodeError(nodeId: string, error: any): void;

  // Event stream for real-time updates
  getEventStream(): EventEmitter;
}
```

#### 1.3.2 Real-time Event Streaming

**File:** `src/research/research-stream.controller.ts` (NEW)

```typescript
@Controller('research/stream')
export class ResearchStreamController {
  constructor(private researchLogger: ResearchLogger) {}

  @Sse('events/:logId')
  streamEvents(@Param('logId') logId: string): Observable<MessageEvent> {
    return this.researchLogger.getEventStream().pipe(
      filter(event => event.logId === logId),
      map(event => ({
        data: JSON.stringify(event),
        type: event.event,
      }))
    );
  }
}
```

#### 1.3.3 Graph Data Endpoint

**File:** `src/research/research.controller.ts`

```typescript
@Get('graph/:logId')
async getGraphData(@Param('logId') logId: string): Promise<GraphData> {
  const entries = await this.getLogEntries(logId);

  return {
    nodes: this.buildGraphNodes(entries),
    edges: this.buildGraphEdges(entries),
    metadata: {
      startTime: entries[0]?.startTime,
      endTime: entries[entries.length - 1]?.endTime,
      totalDuration: this.calculateTotalDuration(entries),
    }
  };
}
```

---

## Phase 2: Timeline Graph Visualization ✅ COMPLETED (2025-11-22)

**Status**: Fully implemented and tested with Playwright MCP

**Completion Summary**:
- ✅ D3.js Gantt chart timeline visualization
- ✅ Interactive hover tooltips with input/output preview
- ✅ Pinned tooltips for detailed inspection (click to pin)
- ✅ LLM nodes with token count metrics (🤖 purple dots)
- ✅ Tool nodes with latency metrics (🔧 green dots: tavily_search, web_fetch)
- ✅ Stage nodes with duration tracking (⚙️ blue bars)
- ✅ Zoom/pan controls with view mode selection
- ✅ Graceful error handling (403 web_fetch errors)
- ✅ Change detection integration for Angular/D3.js events
- ✅ Comprehensive metrics extraction (toolLatency, tokensUsed, modelLatency)

**Key Achievements**:
- Complete debugging visibility into pipeline execution
- Token usage tracking per stage (avg ~8,500 tokens/query)
- Tool performance metrics (web_fetch: 0.1-1.8s, tavily_search: ~1s)
- Error transparency (403 Forbidden errors visible in tooltips)
- Interactive tooltips allow scrolling through long content

### 2.1 Visualization Requirements

**Purpose:** Show complete execution history with timing relationships

**Features:**
- Horizontal timeline showing when nodes were initialized and completed
- Parallel execution visualization (overlapping time ranges)
- Dependency relationships visible
- Interactive zoom and pan
- Detailed node inspection on hover/click

### 2.2 Component Architecture

**File:** `client/src/app/features/logs/components/timeline-graph/timeline-graph.ts` (NEW)

```typescript
@Component({
  selector: 'app-timeline-graph',
  standalone: true,
  template: `
    <div class="timeline-graph-container">
      <div class="timeline-controls">
        <button (click)="zoomIn()">Zoom In</button>
        <button (click)="zoomOut()">Zoom Out</button>
        <button (click)="resetZoom()">Reset</button>
        <select [(ngModel)]="viewMode">
          <option value="gantt">Gantt Chart</option>
          <option value="timeline">Timeline</option>
          <option value="dependencies">Dependencies</option>
        </select>
      </div>
      <svg #timelineSvg class="timeline-svg"></svg>
      <div class="node-details" *ngIf="selectedNode">
        <app-node-details [node]="selectedNode" />
      </div>
    </div>
  `
})
export class TimelineGraphComponent implements OnInit, AfterViewInit {
  @ViewChild('timelineSvg') svgElement!: ElementRef;
  @Input() graphData!: GraphData;

  private svg: d3.Selection<SVGElement>;
  private zoom: d3.ZoomBehavior;
  private xScale: d3.ScaleTime;
  private yScale: d3.ScaleBand;

  viewMode: 'gantt' | 'timeline' | 'dependencies' = 'gantt';
  selectedNode: GraphNode | null = null;

  ngAfterViewInit() {
    this.initializeSvg();
    this.renderTimeline();
  }

  private initializeSvg(): void {
    // D3.js SVG initialization
    this.svg = d3.select(this.svgElement.nativeElement);

    // Setup zoom behavior
    this.zoom = d3.zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', (event) => this.handleZoom(event));

    this.svg.call(this.zoom);
  }

  private renderTimeline(): void {
    // Calculate time domain
    const times = this.graphData.nodes.flatMap(n => [n.startTime, n.endTime]);
    const minTime = d3.min(times)!;
    const maxTime = d3.max(times)!;

    // Create time scale
    this.xScale = d3.scaleTime()
      .domain([minTime, maxTime])
      .range([50, width - 50]);

    // Create node scale (vertical positioning)
    this.yScale = d3.scaleBand()
      .domain(this.graphData.nodes.map(n => n.id))
      .range([50, height - 50])
      .padding(0.2);

    // Render nodes as bars
    this.renderNodes();

    // Render edges
    this.renderEdges();

    // Render axes
    this.renderAxes();
  }

  private renderNodes(): void {
    const nodeGroups = this.svg.selectAll('.node-group')
      .data(this.graphData.nodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .attr('transform', d => `translate(0, ${this.yScale(d.id)})`);

    // Draw node bars (Gantt-style)
    nodeGroups.append('rect')
      .attr('class', 'node-bar')
      .attr('x', d => this.xScale(d.startTime))
      .attr('width', d => {
        if (!d.endTime) return 20; // Minimal width for pending/running
        return this.xScale(d.endTime) - this.xScale(d.startTime);
      })
      .attr('height', this.yScale.bandwidth())
      .attr('fill', d => this.getNodeColor(d))
      .attr('opacity', d => d.status === 'completed' ? 0.8 : 0.5)
      .on('click', (event, d) => this.onNodeClick(d))
      .on('mouseenter', (event, d) => this.onNodeHover(d))
      .on('mouseleave', () => this.onNodeLeave());

    // Add node labels
    nodeGroups.append('text')
      .attr('x', d => this.xScale(d.startTime) + 5)
      .attr('y', this.yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .text(d => d.name)
      .attr('fill', 'white')
      .attr('font-size', '12px');

    // Add status indicators
    nodeGroups.append('circle')
      .attr('cx', d => this.xScale(d.endTime || d.startTime))
      .attr('cy', this.yScale.bandwidth() / 2)
      .attr('r', 5)
      .attr('fill', d => this.getStatusColor(d.status));
  }

  private renderEdges(): void {
    // Draw dependency arrows
    this.svg.selectAll('.edge-line')
      .data(this.graphData.edges)
      .enter()
      .append('line')
      .attr('class', 'edge-line')
      .attr('x1', d => this.getNodeEndX(d.source))
      .attr('y1', d => this.getNodeCenterY(d.source))
      .attr('x2', d => this.getNodeStartX(d.target))
      .attr('y2', d => this.getNodeCenterY(d.target))
      .attr('stroke', '#666')
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)');
  }

  private getNodeColor(node: GraphNode): string {
    // Digital Hygge Design System colors
    const colorMap = {
      'stage': '#4d7c0f',    // moss green
      'tool': '#64748b',     // slate
      'llm': '#7c3aed',      // violet
      'retry': '#ea580c'     // clay
    };
    return colorMap[node.type] || '#a8a29e';  // stone (default)
  }

  private getStatusColor(status: string): string {
    // Digital Hygge Design System status colors
    const statusMap = {
      'pending': '#a8a29e',     // stone
      'running': '#4d7c0f',     // moss green
      'completed': '#4d7c0f',   // moss green
      'error': '#ea580c',       // clay
      'retrying': '#ea580c'     // clay
    };
    return statusMap[status] || '#a8a29e';  // stone (default)
  }
}
```

### 2.3 Visualization Modes

#### Mode 1: Gantt Chart View
- Horizontal bars showing execution timespan
- Y-axis: Node hierarchy (stages → tools → LLM calls)
- X-axis: Time
- Overlapping bars show parallel execution
- Color-coded by node type

#### Mode 2: Timeline View
- Events plotted on single timeline
- Circles for start events, squares for end events
- Swimlanes for different node types
- Connecting lines show dependencies

#### Mode 3: Dependencies View
- Focus on dependency relationships
- Nodes positioned by execution order
- Curved arrows show data flow
- Critical path highlighted

---

## Phase 4: Animated Knowledge Graph Visualization ✅ COMPLETED (2025-12-02)

### 4.1 Visualization Requirements

**Purpose:** Interactive knowledge graph showing research execution flow with animated effects

**Features:**
- Force-directed graph layout with D3.js v7.9.0
- Animated particle effects flowing along edges
- Pulsing glow rings for active/running nodes
- Interactive drag, zoom, and pan controls
- Detailed tooltips with node information
- Integration with Research Quality Inspector dashboard

### 4.2 Component Architecture

**KnowledgeGraphComponent** (`/client/src/app/shared/components/knowledge-graph/knowledge-graph.ts`):

```typescript
@Component({
  selector: 'app-knowledge-graph',
  standalone: true,
  template: `
    <div class="knowledge-graph-container">
      <div class="graph-controls">
        <button (click)="zoomIn()" title="Zoom In">+</button>
        <button (click)="zoomOut()" title="Zoom Out">-</button>
        <button (click)="resetView()" title="Reset View">Reset</button>
        <button (click)="toggleAnimations()" title="Toggle Animations">
          {{ animationsEnabled ? 'Disable' : 'Enable' }} Animations
        </button>
      </div>

      <svg #graphSvg class="graph-svg">
        <defs>
          <!-- Glow filter for active nodes -->
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          <!-- Arrow markers -->
          <marker id="arrowhead" markerWidth="10" markerHeight="10"
                  refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#666" />
          </marker>
        </defs>

        <g class="edges-container"></g>
        <g class="particles-container"></g>
        <g class="nodes-container"></g>
      </svg>

      <div class="graph-legend">
        <div class="legend-section">
          <h4>Node Types</h4>
          <div class="legend-item"><span class="dot session"></span> Session</div>
          <div class="legend-item"><span class="dot phase"></span> Phase</div>
          <div class="legend-item"><span class="dot step"></span> Step</div>
          <div class="legend-item"><span class="dot tool"></span> Tool</div>
        </div>
        <div class="legend-section">
          <h4>Status</h4>
          <div class="legend-item"><span class="dot pending"></span> Pending</div>
          <div class="legend-item"><span class="dot running"></span> Running</div>
          <div class="legend-item"><span class="dot completed"></span> Completed</div>
          <div class="legend-item"><span class="dot error"></span> Error</div>
        </div>
      </div>

      <div class="tooltip" [class.visible]="hoveredNode">
        <div class="tooltip-header">{{ hoveredNode?.name }}</div>
        <div class="tooltip-content">
          <div>Type: {{ hoveredNode?.type }}</div>
          <div>Status: {{ hoveredNode?.status }}</div>
          <div *ngIf="hoveredNode?.duration">Duration: {{ formatDuration(hoveredNode.duration) }}</div>
        </div>
      </div>
    </div>
  `
})
export class KnowledgeGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('graphSvg') svgElement!: ElementRef;
  @Input() graphData!: GraphData;

  private svg: d3.Selection<SVGElement>;
  private simulation: d3.Simulation<GraphNode, GraphEdge>;
  private animationFrameId: number | null = null;

  hoveredNode: GraphNode | null = null;
  animationsEnabled = true;

  // Key features:
  // - Force simulation with D3.js
  // - SVG filters for glow effects
  // - Animated particle system along edges
  // - Drag, zoom, pan interactions
  // - Responsive tooltip system
  // - Performance-optimized rendering
}
```

**GraphBuilderService** (`/client/src/app/core/services/graph-builder.service.ts`):

```typescript
@Injectable({ providedIn: 'root' })
export class GraphBuilderService {
  buildGraphFromLogs(logs: LogDetail): GraphData {
    // Converts LogDetail entries into GraphData structure
    // Processes: planning, phase, step, evaluation events
    // Maps tool names to icons and colors
    // Creates hierarchical graph: session -> phases -> steps
  }

  private getToolIcon(toolName: string): string {
    const iconMap = {
      'web_fetch': 'globe',
      'tavily_search': 'search',
      'duckduckgo_search': 'search',
      'brave_search': 'search',
      'llm': 'robot',
    };
    return iconMap[toolName] || 'cog';
  }

  private getToolColor(toolName: string): string {
    // Digital Hygge Design System tool colors
    const colorMap = {
      'web_fetch': '#64748b',      // slate
      'tavily_search': '#4d7c0f',  // moss green
      'duckduckgo_search': '#4d7c0f', // moss green
      'brave_search': '#ea580c',   // clay
      'llm': '#7c3aed',            // violet
    };
    return colorMap[toolName] || '#a8a29e';  // stone (default)
  }
}
```

### 4.3 Implemented Features

#### Feature 1: Animated Visual Effects
- **Particle Flow**: Animated particles flowing along edges showing data flow direction
- **Pulsing Glow Rings**: Active/running nodes display animated pulsing glow rings
- **SVG Filters**: Smooth glow effects using SVG filters
- **Smooth Transitions**: 60fps animations using requestAnimationFrame

#### Feature 2: Interactive Controls
- **Drag Nodes**: Click and drag any node to reposition
- **Zoom**: Mouse wheel or buttons (0.5x - 5x range)
- **Pan**: Click and drag background to pan view
- **Reset View**: Return to default zoom and center

#### Feature 3: Detailed Tooltips
- Hover over any node for quick info
- Shows: name, type, status, duration
- Status-specific styling
- Formatted duration (ms, s, m)

#### Feature 4: Control Panel
- Zoom In/Out buttons
- Reset View button
- Toggle Animations (for performance)

#### Feature 5: Legend
- Node type indicators with colors
- Status indicators with descriptions

---

## Phase 3: Evaluation Mechanism 🎯 NEXT PRIORITY

### 4.1 Quality Scoring Framework

**Purpose:** Automated evaluation of research quality

**Dimensions:**
1. **Relevance Score** (0-100)
2. **Completeness Score** (0-100)
3. **Accuracy Score** (0-100)
4. **Source Quality Score** (0-100)
5. **Coherence Score** (0-100)

### 4.2 Evaluation Architecture

```typescript
interface EvaluationResult {
  logId: string;
  timestamp: string;
  overallScore: number;
  dimensions: {
    relevance: DimensionScore;
    completeness: DimensionScore;
    accuracy: DimensionScore;
    sourceQuality: DimensionScore;
    coherence: DimensionScore;
  };
  recommendations: string[];
  improvements: string[];
}

interface DimensionScore {
  score: number;          // 0-100
  weight: number;         // 0-1 (sum of weights = 1)
  confidence: number;     // 0-1
  evidence: string[];     // Supporting evidence
  factors: {
    [key: string]: number;
  };
}
```

### 4.3 Evaluation Service

**File:** `src/evaluation/evaluation.service.ts` (NEW)

```typescript
@Injectable()
export class EvaluationService {
  constructor(
    private ollamaService: OllamaService,
    private logsService: LogsService,
  ) {}

  async evaluateResearch(logId: string): Promise<EvaluationResult> {
    const logData = await this.logsService.getLogDetail(logId);

    // Run parallel evaluations
    const [
      relevance,
      completeness,
      accuracy,
      sourceQuality,
      coherence
    ] = await Promise.all([
      this.evaluateRelevance(logData),
      this.evaluateCompleteness(logData),
      this.evaluateAccuracy(logData),
      this.evaluateSourceQuality(logData),
      this.evaluateCoherence(logData),
    ]);

    // Calculate weighted overall score
    const dimensions = { relevance, completeness, accuracy, sourceQuality, coherence };
    const overallScore = this.calculateOverallScore(dimensions);

    // Generate recommendations
    const recommendations = this.generateRecommendations(dimensions);
    const improvements = this.generateImprovements(dimensions);

    return {
      logId,
      timestamp: new Date().toISOString(),
      overallScore,
      dimensions,
      recommendations,
      improvements,
    };
  }

  private async evaluateRelevance(logData: LogDetail): Promise<DimensionScore> {
    const prompt = `
Evaluate the relevance of this research answer to the original query.

Query: ${logData.query}
Answer: ${this.extractAnswer(logData)}

Rate 0-100 considering:
1. Direct address of query intent
2. Inclusion of key topics
3. Absence of tangential information

Provide JSON: {"score": number, "evidence": string[], "factors": {...}}
    `;

    const response = await this.ollamaService.chat([
      { role: 'user', content: prompt }
    ]);

    return this.parseEvaluationResponse(response, 0.3);
  }

  private async evaluateCompleteness(logData: LogDetail): Promise<DimensionScore> {
    const searchResults = this.extractSearchResults(logData);
    const answer = this.extractAnswer(logData);

    const prompt = `
Evaluate the completeness of this research answer.

Query: ${logData.query}
Search Results Found: ${searchResults.length}
Answer: ${answer}

Rate 0-100 considering:
1. Coverage of query aspects
2. Depth of information
3. Multiple perspectives included
4. Sufficient evidence provided

Provide JSON: {"score": number, "evidence": string[], "factors": {...}}
    `;

    const response = await this.ollamaService.chat([
      { role: 'user', content: prompt }
    ]);

    return this.parseEvaluationResponse(response, 0.25);
  }

  private async evaluateAccuracy(logData: LogDetail): Promise<DimensionScore> {
    // Use LLM to cross-check facts
    const answer = this.extractAnswer(logData);
    const sources = this.extractSources(logData);

    const prompt = `
Evaluate the factual accuracy of this answer against provided sources.

Answer: ${answer}

Sources:
${sources.map((s, i) => `${i + 1}. ${s.title}\n${s.content}`).join('\n\n')}

Rate 0-100 considering:
1. Factual correctness
2. Source citation accuracy
3. No contradictions
4. Up-to-date information

Provide JSON: {"score": number, "evidence": string[], "factors": {...}}
    `;

    const response = await this.ollamaService.chat([
      { role: 'user', content: prompt }
    ]);

    return this.parseEvaluationResponse(response, 0.25);
  }

  private async evaluateSourceQuality(logData: LogDetail): Promise<DimensionScore> {
    const sources = this.extractSources(logData);

    // Calculate source quality metrics
    const factors = {
      domainAuthority: this.calculateDomainAuthority(sources),
      recency: this.calculateRecency(sources),
      diversity: this.calculateSourceDiversity(sources),
      credibility: this.calculateCredibility(sources),
    };

    const score = Object.values(factors).reduce((a, b) => a + b, 0) / Object.keys(factors).length;

    return {
      score,
      weight: 0.15,
      confidence: 0.8,
      evidence: sources.map(s => s.url),
      factors,
    };
  }

  private async evaluateCoherence(logData: LogDetail): Promise<DimensionScore> {
    const answer = this.extractAnswer(logData);

    const prompt = `
Evaluate the coherence and readability of this research answer.

Answer: ${answer}

Rate 0-100 considering:
1. Logical flow
2. Clear structure
3. Readability
4. Professional tone
5. Proper citations

Provide JSON: {"score": number, "evidence": string[], "factors": {...}}
    `;

    const response = await this.ollamaService.chat([
      { role: 'user', content: prompt }
    ]);

    return this.parseEvaluationResponse(response, 0.05);
  }

  private calculateOverallScore(dimensions: any): number {
    return Object.values(dimensions).reduce((acc: number, dim: any) => {
      return acc + (dim.score * dim.weight);
    }, 0);
  }

  private generateRecommendations(dimensions: any): string[] {
    const recommendations: string[] = [];

    // Analyze weak dimensions
    Object.entries(dimensions).forEach(([name, dim]: [string, any]) => {
      if (dim.score < 70) {
        recommendations.push(this.getRecommendation(name, dim));
      }
    });

    return recommendations;
  }

  private getRecommendation(dimension: string, score: DimensionScore): string {
    const recommendations: Record<string, string> = {
      relevance: `Improve relevance (${score.score.toFixed(0)}): Focus more directly on the query intent. Consider refining search queries.`,
      completeness: `Improve completeness (${score.score.toFixed(0)}): Add more depth and coverage. Consider additional search queries or sources.`,
      accuracy: `Improve accuracy (${score.score.toFixed(0)}): Verify facts against sources more carefully. Consider more authoritative sources.`,
      sourceQuality: `Improve source quality (${score.score.toFixed(0)}): Use more authoritative and recent sources. Increase source diversity.`,
      coherence: `Improve coherence (${score.score.toFixed(0)}): Improve structure and flow. Make citations clearer.`,
    };

    return recommendations[dimension] || `Improve ${dimension} score`;
  }
}
```

### 4.4 Evaluation UI Component

**File:** `client/src/app/features/logs/components/evaluation-panel/evaluation-panel.ts` (NEW)

```typescript
@Component({
  selector: 'app-evaluation-panel',
  standalone: true,
  template: `
    <div class="evaluation-panel">
      <div class="overall-score" [class]="getScoreClass(evaluation.overallScore)">
        <div class="score-circle">
          <span class="score-value">{{ evaluation.overallScore.toFixed(0) }}</span>
          <span class="score-label">Overall</span>
        </div>
      </div>

      <div class="dimensions-grid">
        <div class="dimension-card" *ngFor="let dim of getDimensions()">
          <h4>{{ dim.name }}</h4>
          <div class="score-bar">
            <div class="score-fill"
                 [style.width.%]="dim.score"
                 [class]="getScoreClass(dim.score)">
            </div>
            <span class="score-text">{{ dim.score.toFixed(0) }}</span>
          </div>

          <div class="factors" *ngIf="dim.factors">
            <div class="factor" *ngFor="let factor of getFactors(dim)">
              <span class="factor-name">{{ factor.name }}</span>
              <span class="factor-value">{{ factor.value.toFixed(1) }}</span>
            </div>
          </div>

          <div class="evidence" *ngIf="showEvidence">
            <ul>
              <li *ngFor="let item of dim.evidence">{{ item }}</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="recommendations" *ngIf="evaluation.recommendations.length">
        <h3>Recommendations</h3>
        <ul>
          <li *ngFor="let rec of evaluation.recommendations">{{ rec }}</li>
        </ul>
      </div>

      <div class="improvements" *ngIf="evaluation.improvements.length">
        <h3>Suggested Improvements</h3>
        <ul>
          <li *ngFor="let imp of evaluation.improvements">{{ imp }}</li>
        </ul>
      </div>

      <button class="run-evaluation-btn"
              (click)="runEvaluation()"
              [disabled]="isEvaluating">
        {{ isEvaluating ? 'Evaluating...' : 'Run Evaluation' }}
      </button>
    </div>
  `,
  styles: [`
    .evaluation-panel {
      padding: 20px;
    }

    .overall-score {
      text-align: center;
      margin-bottom: 30px;
    }

    .score-circle {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
      border: 8px solid;
    }

    .score-circle.excellent { border-color: #10b981; background: #d1fae5; }
    .score-circle.good { border-color: #3b82f6; background: #dbeafe; }
    .score-circle.fair { border-color: #f59e0b; background: #fef3c7; }
    .score-circle.poor { border-color: #ef4444; background: #fee2e2; }

    .score-value {
      font-size: 48px;
      font-weight: bold;
    }

    .dimensions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .dimension-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
    }

    .score-bar {
      position: relative;
      height: 30px;
      background: #f3f4f6;
      border-radius: 4px;
      overflow: hidden;
      margin: 10px 0;
    }

    .score-fill {
      height: 100%;
      transition: width 0.5s ease;
    }

    .score-fill.excellent { background: #10b981; }
    .score-fill.good { background: #3b82f6; }
    .score-fill.fair { background: #f59e0b; }
    .score-fill.poor { background: #ef4444; }

    .recommendations, .improvements {
      margin-top: 20px;
      padding: 15px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .run-evaluation-btn {
      margin-top: 20px;
      padding: 10px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }

    .run-evaluation-btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
  `]
})
export class EvaluationPanelComponent {
  @Input() logId!: string;

  evaluation: EvaluationResult | null = null;
  isEvaluating = false;
  showEvidence = false;

  constructor(private evaluationService: EvaluationService) {}

  async runEvaluation() {
    this.isEvaluating = true;
    try {
      this.evaluation = await this.evaluationService.evaluate(this.logId);
    } finally {
      this.isEvaluating = false;
    }
  }

  getDimensions() {
    if (!this.evaluation) return [];
    return Object.entries(this.evaluation.dimensions).map(([name, dim]) => ({
      name: this.formatDimensionName(name),
      ...dim
    }));
  }

  getScoreClass(score: number): string {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  }

  formatDimensionName(name: string): string {
    return name.replace(/([A-Z])/g, ' $1').trim()
      .replace(/^./, str => str.toUpperCase());
  }
}
```

---

## Phase 5: Advanced Features & Future Enhancements

### 5.1 Comparative Analysis

**Feature:** Compare multiple research queries side-by-side

- Overlay timeline graphs for comparison
- Diff analysis of evaluation scores
- Performance benchmarking
- A/B testing support

### 5.2 Historical Trends

**Feature:** Track improvement over time

- Score trends over sessions
- Performance metrics history
- Query pattern analysis
- System health dashboard

### 5.3 Advanced Evaluation Features

#### Feature 1: Custom Evaluation Criteria
- User-defined scoring dimensions
- Weighted scoring profiles
- Domain-specific evaluators

#### Feature 2: Ground Truth Comparison
- Upload reference answers
- Automated similarity scoring
- BLEU/ROUGE metrics
- Human evaluation integration

#### Feature 3: Continuous Improvement
- Auto-retry with improvements
- Feedback loop integration
- Prompt optimization suggestions

### 5.4 Export & Reporting

**Features:**
- Export timeline graphs as PNG/SVG
- Generate evaluation reports (PDF)
- CSV export for analytics
- Jupyter notebook integration

---

## Implementation Timeline

### Sprint 1: Foundation (Week 1-2)
- [ ] Enhanced data model (backend + frontend)
- [ ] Backend event streaming (SSE)
- [ ] Updated logging service with lifecycle tracking
- [ ] API endpoints for graph data

### Sprint 2: Timeline Graph (Week 3-4)
- [ ] Timeline graph component with D3.js
- [ ] Gantt chart view
- [ ] Dependencies view
- [ ] Interactive features (zoom, pan, hover)

### Sprint 3: Real-time Graph (Week 5-6)
- [ ] Real-time graph component
- [ ] Force-directed layout
- [ ] Live update integration
- [ ] Active nodes monitoring

### Sprint 4: Evaluation System (Week 7-9)
- [ ] Evaluation service implementation
- [ ] All 5 dimension evaluators
- [ ] Evaluation UI panel
- [ ] Recommendations engine

### Sprint 5: Polish & Testing (Week 10)
- [ ] Integration testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] User testing

---

## Technical Dependencies

### Backend
- NestJS 10+ (existing)
- Winston 3+ (existing)
- Server-Sent Events (SSE) - Built into NestJS
- Ollama (existing) - For LLM and evaluation
- Node.js 18+ (existing)

### Frontend
- **Angular 20.2.0** (existing)
- D3.js v7 - For visualizations (NEW)
- RxJS 7.8+ (existing) - For event streams
- TypeScript 5.9+ (existing)
- Zone.js 0.15+ (existing)

### New Packages Needed

```bash
# Backend
npm install @nestjs/platform-socket.io

# Frontend
npm install d3 @types/d3
npm install d3-force d3-zoom d3-scale d3-selection
```

---

## Success Metrics

### Timeline Graph Success Criteria
- ✅ Visualize complete execution history
- ✅ Show parallel execution clearly
- ✅ Interactive exploration (zoom/pan)
- ✅ <100ms render time for typical queries
- ✅ Export capability

### Real-time Graph Success Criteria
- ✅ Live updates with <500ms latency
- ✅ Smooth animations (60fps)
- ✅ Handle up to 50 concurrent nodes
- ✅ Clear active state visualization
- ✅ Stable connection handling

### Evaluation Success Criteria
- ✅ Evaluation completes in <30s
- ✅ Scores correlate with manual evaluation (>0.8 correlation)
- ✅ Actionable recommendations provided
- ✅ Consistent scoring across similar queries
- ✅ Clear factor breakdown

---

## Testing Strategy

### Unit Tests
- Data model transformations
- Evaluation scoring logic
- Graph layout algorithms
- Event stream handling

### Integration Tests
- Backend SSE streaming
- Frontend event consumption
- Graph rendering pipeline
- Evaluation service workflow

### E2E Tests
- Complete research query with live visualization
- Timeline graph interactions
- Real-time graph updates
- Evaluation generation and display

### Performance Tests
- Graph rendering with 100+ nodes
- SSE connection stability
- Concurrent evaluation requests
- Memory usage monitoring

---

## Risk Mitigation

### Risk 1: D3.js Learning Curve
**Mitigation:**
- Start with simple examples
- Use existing D3 templates
- Allocate extra time for R&D

### Risk 2: SSE Connection Stability
**Mitigation:**
- Implement reconnection logic
- Fallback to polling if SSE fails
- Connection health monitoring

### Risk 3: Evaluation Accuracy
**Mitigation:**
- Multiple validation approaches
- Iterative refinement of prompts
- User feedback integration
- Ground truth testing

### Risk 4: Performance with Large Graphs
**Mitigation:**
- Implement virtualization
- Level-of-detail rendering
- Lazy loading of node details
- WebGL fallback for >100 nodes

---

## Next Steps

1. **Review and approve this plan**
2. **Set up development branches**
3. **Install required dependencies**
4. **Begin Sprint 1: Foundation work**
5. **Schedule regular demos/reviews**

---

## Questions for Stakeholder

1. Priority order confirmed?
2. Timeline acceptable?
3. Evaluation criteria sufficient?
4. Any additional visualization requirements?
5. Integration with existing debugging tools?
