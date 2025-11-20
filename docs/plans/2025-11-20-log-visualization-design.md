# Log Visualization Design - Phase 2.5

**Date**: 2025-11-20
**Status**: Approved
**Phase**: Phase 2.5 - Log Visualization & Debugging

## Overview

Visual interpretation of research pipeline logs enabling developers to debug why specific information didn't make it into research results. Provides timeline view of the 3-stage research process with expandable nodes showing inputs/outputs at each step.

## Use Case

**Problem**: User queried "what are the news from denmark and what is the impact on the new 4 years" (about Denmark municipality elections), but results didn't include relevant recent election news.

**Solution**: Log visualization allows tracing through:
1. Stage 1: What search queries were generated?
2. Tool calls: What sources did Tavily return?
3. Stage 2: Which sources were selected for content fetch?
4. Stage 3: What information was passed to synthesis?

This reveals exactly where relevant information was filtered out.

## Design Decisions

### Integration Approach
**Decision**: Integrated in Angular UI as `/logs` route
**Rationale**:
- Single application maintains context
- Easy to correlate logs with research results
- Can link from result cards directly to logs
- No separate tool to maintain

### Access Pattern
**Decision**: Dedicated logs page with sessions list + timeline view
**Rationale**:
- Comprehensive view of all research sessions
- Easy to browse and search historical queries
- Provides context for debugging multiple queries
- Clean separation from main research interface

### Visualization Style
**Decision**: Vertical timeline with expandable nodes
**Rationale**:
- Clear hierarchical structure (stages contain tool calls)
- Easy to see sequential flow
- Natural expansion pattern for details
- Visually appealing with color-coded stages

### Data Completeness
**Decision**: NO truncation in UI, permanent log storage
**Rationale**:
- Full query text always visible (word-wrap, not truncate)
- Complete JSON input/output accessible in UI
- No backend file access needed for debugging
- Logs never deleted (permanent debugging history)

## Architecture

### Component Structure

```
/logs route
├── AppHeaderComponent (NEW - navigation)
│   ├── "Research" link → /
│   └── "Logs" link → /logs
├── LogsPageComponent (container)
│   ├── LogsListComponent (left sidebar)
│   │   ├── Search/filter input
│   │   ├── Session list items
│   │   │   ├── Full query text (word-wrapped)
│   │   │   ├── LogId (last 8 chars)
│   │   │   ├── Timestamp (relative)
│   │   │   ├── Duration badge
│   │   │   └── Status icon
│   │   └── Empty state
│   └── LogTimelineComponent (main area)
│       ├── TimelineHeaderComponent
│       │   ├── Full query text
│       │   ├── Complete logId (copyable)
│       │   └── Total execution time
│       ├── StageNodeComponent × 3
│       │   ├── Stage header (icon, name, duration)
│       │   ├── Expand/collapse control
│       │   ├── Input/output preview
│       │   ├── JsonViewerComponent (input)
│       │   ├── JsonViewerComponent (output)
│       │   └── ToolCallNodeComponent × N (nested)
│       │       ├── Tool icon and name
│       │       ├── Duration
│       │       ├── JsonViewerComponent (input)
│       │       └── JsonViewerComponent (output)
│       └── TimelineConnectorComponent
│           └── Visual connecting lines between stages
```

### Backend Components

```
src/logs/
├── logs.controller.ts       # HTTP endpoints
├── logs.service.ts          # Log parsing and querying
├── dto/
│   ├── log-session.dto.ts   # Session summary
│   └── log-detail.dto.ts    # Full session details
└── interfaces/
    └── timeline-node.interface.ts
```

## Backend API Design

### Endpoints

**1. Get All Sessions**
```
GET /api/logs/sessions
Query params:
  - limit: number (default 50, max 200)
  - offset: number (default 0)
  - search: string (query text or logId)
  - status: 'all' | 'completed' | 'error'
  - from: ISO date (start of date range)
  - to: ISO date (end of date range)

Response: {
  sessions: LogSession[],
  total: number,
  limit: number,
  offset: number
}
```

**2. Get Session Details**
```
GET /api/logs/sessions/:logId

Response: {
  logId: string,
  query: string,
  timestamp: string,
  totalDuration: number,
  status: 'completed' | 'error',
  entries: LogEntry[]  // All log entries for this session
}
```

### LogsService Implementation

**Responsibilities:**
- Read and parse `research-combined.log` file
- Parse JSON lines (one JSON object per line)
- Group entries by logId
- Extract query text from Stage 1 input
- Calculate total duration
- Determine status (completed if Stage 3 output exists, error if stage_error)
- Cache parsed sessions (invalidate every 60s)
- Handle log file growth (efficient parsing for large files)

**File Parsing Strategy:**
```typescript
class LogsService {
  private sessionsCache: Map<string, LogSession> = new Map();
  private cacheExpiry: number;

  async getAllSessions(options: QueryOptions): Promise<LogSession[]> {
    if (this.isCacheValid()) {
      return this.filterSessions(Array.from(this.sessionsCache.values()), options);
    }

    // Read log file line by line
    const logFile = await this.readLogFile();
    const entries = logFile.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    // Group by logId
    const sessions = this.groupByLogId(entries);

    // Update cache
    this.sessionsCache = new Map(sessions.map(s => [s.logId, s]));
    this.cacheExpiry = Date.now() + 60000;

    return this.filterSessions(sessions, options);
  }

  async getSessionDetails(logId: string): Promise<LogDetail> {
    // Read and filter entries for this logId only
    const entries = await this.getEntriesForLogId(logId);
    return {
      logId,
      query: this.extractQuery(entries),
      timestamp: entries[0].timestamp,
      totalDuration: this.calculateTotalDuration(entries),
      status: this.determineStatus(entries),
      entries
    };
  }
}
```

**Log Storage:**
- Keep all logs permanently (no deletion)
- Optional: Compress logs older than 30 days (gzip)
- Optional: Move to archive directory (keeps main log file smaller)
- Log files remain readable (decompress on demand if needed)

## Frontend Design

### LogsService (Angular)

**Signals:**
```typescript
// Session list state
sessions = signal<LogSession[]>([]);
isLoadingSessions = signal<boolean>(false);
searchTerm = signal<string>('');
statusFilter = signal<'all' | 'completed' | 'error'>('all');

// Selected session state
selectedLogId = signal<string | null>(null);
logEntries = signal<LogEntry[]>([]);
isLoadingDetails = signal<boolean>(false);
error = signal<string | null>(null);

// Computed
filteredSessions = computed(() => this.filterSessions());
selectedSession = computed(() =>
  this.sessions().find(s => s.logId === this.selectedLogId())
);
timelineNodes = computed(() =>
  this.buildTimelineFromEntries(this.logEntries())
);
```

**Methods:**
```typescript
async loadSessions(): Promise<void>
async selectSession(logId: string): Promise<void>
private filterSessions(): LogSession[]
private buildTimelineFromEntries(entries: LogEntry[]): TimelineNode[]
```

### TypeScript Interfaces

**Frontend Models:**
```typescript
// log-session.model.ts
export interface LogSession {
  logId: string;
  query: string;              // Full query text (no truncation)
  timestamp: string;          // ISO format
  totalDuration: number;      // milliseconds
  stageCount: number;         // Always 3 for complete
  toolCallCount: number;      // Number of tool executions
  status: 'completed' | 'error';
}

// timeline-node.model.ts
export interface TimelineNode {
  type: 'stage' | 'tool';
  id: string;
  name: string;               // "Stage 1: Query Analysis"
  icon: string;               // Emoji or icon class
  color: string;              // Hex color
  duration: number;           // milliseconds
  timestamp: string;
  input?: any;                // Full input data
  output?: any;               // Full output data
  children?: TimelineNode[];  // Tool calls for stages
  isExpanded?: boolean;       // Expansion state
}

// log-entry.model.ts (matches backend)
export interface LogEntry {
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

## Visual Design Details

### Color Palette (Timeline-specific)

```scss
// Stage colors
$timeline-stage1: #3b82f6;  // Blue - Query Analysis & Search
$timeline-stage2: #8b5cf6;  // Purple - Content Fetch
$timeline-stage3: #10b981;  // Green - Synthesis
$timeline-tool: #f59e0b;    // Orange - Tool calls
$timeline-error: #ef4444;   // Red - Errors

// UI elements
$timeline-line: #e5e7eb;    // Connector lines
$timeline-bg: #f9fafb;      // Background
$timeline-hover: #f3f4f6;   // Hover state
```

### Stage Node Styling (BEM)

```scss
.stage-node {
  @include card;
  border-left: 4px solid var(--stage-color);
  margin-bottom: $spacing-md;
  transition: box-shadow $transition-base;

  &:hover {
    box-shadow: $shadow-md;
  }

  &__header {
    @include flex-between;
    cursor: pointer;
    padding: $spacing-md;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__icon {
    font-size: $font-size-xl;
  }

  &__name {
    font-weight: $font-semibold;
    color: $text-primary;
  }

  &__duration {
    font-size: $font-size-sm;
    color: $text-secondary;
    padding: 2px 8px;
    background: $bg-tertiary;
    border-radius: $border-radius-sm;
  }

  &__expand-icon {
    color: $text-muted;
    transition: transform $transition-fast;

    &--expanded {
      transform: rotate(90deg);
    }
  }

  &__content {
    padding: 0 $spacing-md $spacing-md;
    border-top: 1px solid $border;
  }

  &__children {
    margin-left: $spacing-lg;
    border-left: 2px dashed $timeline-line;
    padding-left: $spacing-md;
  }
}
```

### Tool Call Node Styling

```scss
.tool-node {
  background: $bg-primary;
  border-left: 2px solid $timeline-tool;
  padding: $spacing-sm;
  margin: $spacing-sm 0;
  border-radius: $border-radius-sm;

  &__header {
    @include flex-between;
    cursor: pointer;
    padding: $spacing-xs;
  }

  &__info {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
  }

  &__icon {
    font-size: $font-size-base;
  }

  &__name {
    font-weight: $font-medium;
    font-size: $font-size-sm;
    color: $timeline-tool;
  }

  &__duration {
    font-size: $font-size-xs;
    color: $text-muted;
  }
}
```

### JSON Viewer Styling

```scss
.json-viewer {
  background: #1e1e1e;      // Dark background (code editor style)
  border-radius: $border-radius-sm;
  overflow: hidden;
  margin: $spacing-sm 0;

  &__header {
    @include flex-between;
    background: #2d2d2d;
    padding: $spacing-xs $spacing-sm;
    border-bottom: 1px solid #3d3d3d;
  }

  &__title {
    font-size: $font-size-sm;
    color: #9cdcfe;          // Light blue
    font-family: 'Monaco', 'Courier New', monospace;
  }

  &__actions {
    display: flex;
    gap: $spacing-xs;
  }

  &__copy-btn {
    @include button-reset;
    font-size: $font-size-xs;
    color: #858585;
    padding: 2px 8px;
    border-radius: $border-radius-sm;
    transition: color $transition-fast;

    &:hover {
      color: #d4d4d4;
      background: rgba(255,255,255,0.1);
    }
  }

  &__content {
    padding: $spacing-sm;
    max-height: 300px;
    overflow: auto;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: $font-size-sm;
    line-height: 1.5;
    color: #d4d4d4;

    &--expanded {
      max-height: none;
    }
  }

  &__expand {
    text-align: center;
    padding: $spacing-xs;
    background: #2d2d2d;
    border-top: 1px solid #3d3d3d;

    button {
      @include button-reset;
      color: #9cdcfe;
      font-size: $font-size-xs;
      padding: $spacing-xs;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}

// JSON syntax highlighting
.json-key { color: #9cdcfe; }      // Light blue
.json-string { color: #ce9178; }   // Orange
.json-number { color: #b5cea8; }   // Light green
.json-boolean { color: #569cd6; }  // Blue
.json-null { color: #569cd6; }     // Blue
```

### LogsListComponent Styling

```scss
.logs-list {
  background: $bg-primary;
  border-right: 1px solid $border;
  height: 100vh;
  display: flex;
  flex-direction: column;

  &__search {
    padding: $spacing-md;
    border-bottom: 1px solid $border;
  }

  &__search-input {
    width: 100%;
    padding: $spacing-sm;
    border: 1px solid $border;
    border-radius: $border-radius-sm;
    font-size: $font-size-sm;

    &:focus {
      outline: 2px solid $primary;
      border-color: $primary;
    }
  }

  &__count {
    display: block;
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__sessions {
    flex: 1;
    overflow-y: auto;
  }

  &__session-item {
    padding: $spacing-sm $spacing-md;
    border-bottom: 1px solid $border;
    cursor: pointer;
    transition: background-color $transition-fast;

    &:hover {
      background-color: $bg-secondary;
    }

    &--active {
      background-color: lighten($primary, 45%);
      border-left: 3px solid $primary;
    }
  }

  &__query {
    font-weight: $font-medium;
    color: $text-primary;
    margin-bottom: $spacing-xs;
    word-wrap: break-word;
    line-height: $line-height-tight;
  }

  &__meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: $font-size-xs;
    color: $text-secondary;
  }

  &__logid {
    font-family: 'Monaco', monospace;
    color: $text-muted;
  }

  &__timestamp {
    color: $text-secondary;
  }

  &__duration {
    padding: 2px 6px;
    background: $bg-tertiary;
    border-radius: $border-radius-sm;
    font-weight: $font-medium;
  }

  &__status-icon {
    &--completed { color: $success; }
    &--error { color: $error; }
  }
}
```

## Data Flow

### Loading Sessions Flow
1. User navigates to `/logs`
2. LogsPageComponent calls `logsService.loadSessions()`
3. HTTP GET to `/api/logs/sessions`
4. Backend reads log file, parses, groups by logId
5. Frontend receives sessions array
6. Signals update, UI renders list

### Loading Timeline Flow
1. User clicks session in list
2. `logsService.selectSession(logId)` called
3. HTTP GET to `/api/logs/sessions/:logId`
4. Backend filters entries for that logId
5. Frontend receives complete entries array
6. `buildTimelineFromEntries()` constructs hierarchical timeline
7. Signals update, timeline renders

### Expansion Flow
1. User clicks stage header
2. Toggle `isExpanded` property in timeline node
3. Angular reactivity shows/hides content
4. Smooth CSS transition (max-height animation)

## Backend Implementation Details

### LogsService - Reading Log File

```typescript
@Injectable()
export class LogsService {
  private readonly logFilePath: string;
  private sessionsCache: Map<string, LogSession> = new Map();
  private cacheExpiry = 0;

  constructor(private configService: ConfigService) {
    const logDir = this.configService.get<string>('LOG_DIR') || './logs';
    this.logFilePath = path.join(logDir, 'research-combined.log');
  }

  async getAllSessions(options: QueryOptions): Promise<{ sessions: LogSession[], total: number }> {
    // Check cache validity
    if (Date.now() < this.cacheExpiry && this.sessionsCache.size > 0) {
      return this.filterAndPaginate(Array.from(this.sessionsCache.values()), options);
    }

    // Read and parse log file
    const fileContent = await fs.promises.readFile(this.logFilePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    const entries: LogEntry[] = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (err) {
        console.error('Failed to parse log line:', line);
        return null;
      }
    }).filter(Boolean);

    // Group by logId
    const sessionsMap = new Map<string, LogEntry[]>();
    entries.forEach(entry => {
      if (!sessionsMap.has(entry.logId)) {
        sessionsMap.set(entry.logId, []);
      }
      sessionsMap.get(entry.logId).push(entry);
    });

    // Build session summaries
    const sessions: LogSession[] = Array.from(sessionsMap.entries()).map(([logId, entries]) => {
      return this.buildSessionSummary(logId, entries);
    });

    // Update cache
    this.sessionsCache = new Map(sessions.map(s => [s.logId, s]));
    this.cacheExpiry = Date.now() + 60000;  // 60 second cache

    return this.filterAndPaginate(sessions, options);
  }

  private buildSessionSummary(logId: string, entries: LogEntry[]): LogSession {
    const sortedEntries = entries.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Extract query from Stage 1 input
    const stage1Input = entries.find(e => e.stage === 1 && e.operation === 'stage_input');
    const query = stage1Input?.input?.query || 'Unknown query';

    // Calculate total duration
    const firstEntry = sortedEntries[0];
    const lastEntry = sortedEntries[sortedEntries.length - 1];
    const totalDuration = new Date(lastEntry.timestamp).getTime() - new Date(firstEntry.timestamp).getTime();

    // Count stages and tools
    const stageCount = new Set(entries.filter(e => e.stage).map(e => e.stage)).size;
    const toolCallCount = entries.filter(e => e.component !== 'pipeline').length;

    // Determine status
    const hasError = entries.some(e => e.operation === 'stage_error');
    const hasStage3Output = entries.some(e => e.stage === 3 && e.operation === 'stage_output');
    const status = hasError ? 'error' : (hasStage3Output ? 'completed' : 'incomplete');

    return {
      logId,
      query,
      timestamp: firstEntry.timestamp,
      totalDuration,
      stageCount,
      toolCallCount,
      status
    };
  }

  async getSessionDetails(logId: string): Promise<LogDetail> {
    const fileContent = await fs.promises.readFile(this.logFilePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());

    const entries: LogEntry[] = lines
      .map(line => {
        try {
          const entry = JSON.parse(line);
          return entry.logId === logId ? entry : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (entries.length === 0) {
      throw new NotFoundException(`No logs found for logId: ${logId}`);
    }

    const session = this.buildSessionSummary(logId, entries);

    return {
      ...session,
      entries: entries.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
    };
  }
}
```

### LogsController

```typescript
@Controller('api/logs')
export class LogsController {
  constructor(private logsService: LogsService) {}

  @Get('sessions')
  async getSessions(@Query() query: QuerySessionsDto) {
    return this.logsService.getAllSessions({
      limit: query.limit || 50,
      offset: query.offset || 0,
      search: query.search,
      status: query.status || 'all',
      from: query.from,
      to: query.to
    });
  }

  @Get('sessions/:logId')
  async getSessionDetails(@Param('logId') logId: string) {
    return this.logsService.getSessionDetails(logId);
  }
}
```

## Frontend Implementation Details

### Routing Configuration

```typescript
// app.routes.ts
import { Routes } from '@angular/router';
import { ResearchComponent } from './features/research/research';
import { LogsPageComponent } from './features/logs/logs-page';

export const routes: Routes = [
  {
    path: '',
    component: ResearchComponent
  },
  {
    path: 'logs',
    component: LogsPageComponent
  },
  {
    path: 'logs/:logId',
    component: LogsPageComponent
  }
];
```

### LogsPageComponent

```typescript
@Component({
  selector: 'app-logs-page',
  standalone: true,
  imports: [CommonModule, LogsListComponent, LogTimelineComponent],
  template: `
    <div class="logs-page">
      <aside class="logs-page__sidebar">
        <app-logs-list
          [sessions]="logsService.sessions()"
          [selectedLogId]="logsService.selectedLogId()"
          [isLoading]="logsService.isLoadingSessions()"
          [searchTerm]="logsService.searchTerm()"
          (sessionSelected)="onSessionSelected($event)"
          (searchChanged)="onSearchChanged($event)"
        />
      </aside>

      <main class="logs-page__content">
        <app-log-timeline
          *ngIf="logsService.selectedLogId()"
          [timelineNodes]="logsService.timelineNodes()"
          [isLoading]="logsService.isLoadingDetails()"
        />

        <div *ngIf="!logsService.selectedLogId()" class="empty-state">
          <p>Select a research session to view timeline</p>
        </div>
      </main>
    </div>
  `,
  styleUrls: ['./logs-page.scss']
})
export class LogsPageComponent implements OnInit {
  logsService = inject(LogsService);
  route = inject(ActivatedRoute);

  ngOnInit() {
    this.logsService.loadSessions();

    // Handle route parameter
    this.route.params.subscribe(params => {
      if (params['logId']) {
        this.logsService.selectSession(params['logId']);
      }
    });
  }

  onSessionSelected(logId: string) {
    this.logsService.selectSession(logId);
  }

  onSearchChanged(term: string) {
    this.logsService.searchTerm.set(term);
  }
}
```

### Timeline Building Logic

```typescript
// In LogsService
private buildTimelineFromEntries(entries: LogEntry[]): TimelineNode[] {
  if (!entries || entries.length === 0) return [];

  const stages: TimelineNode[] = [];

  // Process each stage (1, 2, 3)
  for (let stageNum = 1; stageNum <= 3; stageNum++) {
    const stageInput = entries.find(e =>
      e.stage === stageNum && e.operation === 'stage_input'
    );
    const stageOutput = entries.find(e =>
      e.stage === stageNum && e.operation === 'stage_output'
    );

    if (!stageInput) continue;  // Stage not started

    // Find tool calls within this stage timeframe
    const toolCalls = entries.filter(e =>
      e.component !== 'pipeline' &&
      e.operation === 'execute' &&
      e.timestamp >= stageInput.timestamp &&
      (!stageOutput || e.timestamp <= stageOutput.timestamp)
    );

    // Build tool nodes
    const toolNodes: TimelineNode[] = toolCalls.map((tool, idx) => ({
      type: 'tool',
      id: `${stageInput.logId}-stage${stageNum}-tool${idx}`,
      name: this.getToolDisplayName(tool.component),
      icon: this.getToolIcon(tool.component),
      color: '#f59e0b',  // Orange
      duration: tool.executionTime || 0,
      timestamp: tool.timestamp,
      input: tool.input,
      output: tool.output,
      isExpanded: false
    }));

    // Build stage node
    const duration = stageOutput?.executionTime ||
      (stageOutput && stageInput ?
        new Date(stageOutput.timestamp).getTime() - new Date(stageInput.timestamp).getTime() :
        0);

    stages.push({
      type: 'stage',
      id: `${stageInput.logId}-stage${stageNum}`,
      name: this.getStageName(stageNum),
      icon: this.getStageIcon(stageNum),
      color: this.getStageColor(stageNum),
      duration,
      timestamp: stageInput.timestamp,
      input: stageInput.input,
      output: stageOutput?.output,
      children: toolNodes,
      isExpanded: false
    });
  }

  return stages;
}

private getStageName(stage: number): string {
  const names = {
    1: 'Query Analysis & Search',
    2: 'Content Fetch & Selection',
    3: 'Synthesis & Answer Generation'
  };
  return names[stage] || `Stage ${stage}`;
}

private getStageIcon(stage: number): string {
  const icons = { 1: '🔍', 2: '📄', 3: '✨' };
  return icons[stage] || '📋';
}

private getStageColor(stage: number): string {
  const colors = {
    1: '#3b82f6',  // Blue
    2: '#8b5cf6',  // Purple
    3: '#10b981'   // Green
  };
  return colors[stage] || '#6b7280';
}

private getToolDisplayName(component: string): string {
  const names = {
    'tavily_search': 'Tavily Search',
    'web_fetch': 'Web Fetch',
    'pdf_extract': 'PDF Extract'
  };
  return names[component] || component;
}

private getToolIcon(component: string): string {
  const icons = {
    'tavily_search': '🔎',
    'web_fetch': '🌐',
    'pdf_extract': '📑'
  };
  return icons[component] || '🔧';
}
```

## Component Templates

### LogTimelineComponent

```html
<div class="log-timeline">
  <div class="log-timeline__header">
    <h2>{{ session.query }}</h2>
    <div class="log-timeline__meta">
      <span class="log-timeline__logid">
        LogID: {{ session.logId }}
        <button (click)="copyLogId()">📋</button>
      </span>
      <span class="log-timeline__duration">
        Total: {{ formatDuration(session.totalDuration) }}
      </span>
    </div>
  </div>

  <div class="log-timeline__stages">
    <app-stage-node
      *ngFor="let stage of timelineNodes; let i = index"
      [node]="stage"
      [isLast]="i === timelineNodes.length - 1"
      (expansionChanged)="onNodeExpanded($event)"
    />
  </div>
</div>
```

### StageNodeComponent

```html
<div class="stage-node" [style.--stage-color]="node.color">
  <div class="stage-node__header" (click)="toggleExpand()">
    <div class="stage-node__title">
      <span class="stage-node__icon">{{ node.icon }}</span>
      <span class="stage-node__name">{{ node.name }}</span>
    </div>
    <div class="stage-node__meta">
      <span class="stage-node__duration">{{ formatDuration(node.duration) }}</span>
      <span class="stage-node__expand-icon" [class.stage-node__expand-icon--expanded]="isExpanded">
        ▶
      </span>
    </div>
  </div>

  <div class="stage-node__content" *ngIf="isExpanded">
    <div class="stage-node__io">
      <app-json-viewer
        title="Input"
        [data]="node.input"
      />

      <app-json-viewer
        *ngIf="node.output"
        title="Output"
        [data]="node.output"
      />
    </div>

    <div class="stage-node__children" *ngIf="node.children && node.children.length > 0">
      <h4>Tool Calls ({{ node.children.length }})</h4>
      <app-tool-node
        *ngFor="let tool of node.children"
        [node]="tool"
      />
    </div>
  </div>

  <div class="stage-node__connector" *ngIf="!isLast"></div>
</div>
```

### JsonViewerComponent

```html
<div class="json-viewer">
  <div class="json-viewer__header">
    <span class="json-viewer__title">{{ title }}</span>
    <div class="json-viewer__actions">
      <button class="json-viewer__copy-btn" (click)="copyJson()">
        📋 Copy
      </button>
      <button class="json-viewer__copy-btn" (click)="toggleRaw()" *ngIf="hasFormatting">
        {{ showRaw ? 'Formatted' : 'Raw' }}
      </button>
    </div>
  </div>

  <div
    class="json-viewer__content"
    [class.json-viewer__content--expanded]="isExpanded"
  >
    <pre *ngIf="!showRaw" [innerHTML]="formattedJson"></pre>
    <pre *ngIf="showRaw">{{ rawJson }}</pre>
  </div>

  <div class="json-viewer__expand" *ngIf="needsExpansion && !isExpanded">
    <button (click)="expand()">Show More</button>
  </div>
</div>
```

```typescript
export class JsonViewerComponent {
  @Input() title = 'Data';
  @Input() data: any;

  isExpanded = false;
  showRaw = false;

  get formattedJson(): string {
    return this.syntaxHighlight(JSON.stringify(this.data, null, 2));
  }

  get rawJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  get needsExpansion(): boolean {
    return this.rawJson.split('\n').length > 15;  // More than 15 lines
  }

  private syntaxHighlight(json: string): string {
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = 'json-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key';
          } else {
            cls = 'json-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }

  copyJson() {
    navigator.clipboard.writeText(this.rawJson);
    // Show toast: "Copied to clipboard"
  }

  expand() {
    this.isExpanded = true;
  }

  toggleRaw() {
    this.showRaw = !this.showRaw;
  }
}
```

## Navigation Integration

### AppHeaderComponent (NEW)

```typescript
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header class="app-header">
      <h1 class="app-header__title">Research Agent</h1>
      <nav class="app-header__nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
          Research
        </a>
        <a routerLink="/logs" routerLinkActive="active">
          Logs
        </a>
      </nav>
    </header>
  `,
  styleUrls: ['./app-header.scss']
})
export class AppHeaderComponent {}
```

**Update app.component.ts:**
```typescript
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppHeaderComponent],
  template: `
    <app-header />
    <router-outlet />
  `
})
export class AppComponent {}
```

### Link from ResultCardComponent

Add to result-card.component.html:
```html
<div class="result-card__actions">
  <button (click)="copyAnswer()">📋 Copy</button>
  <a [routerLink]="['/logs', result.logId]" class="result-card__debug">
    🔍 View Logs
  </a>
</div>
```

## Search & Filtering

### LogsListComponent - Filter UI

```html
<div class="logs-list__filters">
  <input
    type="text"
    class="logs-list__search-input"
    placeholder="Search queries or logId..."
    [ngModel]="searchTerm()"
    (ngModelChange)="searchChanged.emit($event)"
  />

  <div class="logs-list__filter-row">
    <select [(ngModel)]="statusFilter" class="logs-list__select">
      <option value="all">All Status</option>
      <option value="completed">Completed</option>
      <option value="error">Errors Only</option>
    </select>

    <select [(ngModel)]="sortBy" class="logs-list__select">
      <option value="recent">Most Recent</option>
      <option value="oldest">Oldest First</option>
      <option value="longest">Longest Duration</option>
      <option value="shortest">Shortest Duration</option>
    </select>
  </div>

  <span class="logs-list__count">
    {{ sessions.length }} session(s)
  </span>
</div>
```

## Loading States & Skeletons

### Session List Skeleton

```html
<div class="logs-list__skeleton" *ngIf="isLoading">
  <div class="skeleton-item" *ngFor="let i of [1,2,3,4,5]">
    <div class="skeleton-line skeleton-line--title"></div>
    <div class="skeleton-line skeleton-line--meta"></div>
  </div>
</div>
```

```scss
.skeleton-item {
  padding: $spacing-sm $spacing-md;
  border-bottom: 1px solid $border;
}

.skeleton-line {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: $border-radius-sm;

  &--title {
    height: 20px;
    width: 80%;
    margin-bottom: $spacing-xs;
  }

  &--meta {
    height: 14px;
    width: 60%;
  }
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Timeline Skeleton

```html
<div class="timeline-skeleton" *ngIf="isLoading">
  <div class="skeleton-stage" *ngFor="let i of [1,2,3]">
    <div class="skeleton-stage__header"></div>
  </div>
</div>
```

## Testing Strategy

### Unit Tests
- LogsService: Test session parsing, filtering, timeline building
- LogsListComponent: Test filtering, sorting, selection
- LogTimelineComponent: Test node expansion, navigation
- JsonViewerComponent: Test syntax highlighting, copy, expand

### E2E Tests with Playwright
1. Navigate to `/logs` page
2. Verify sessions list loads
3. Search for "Denmark" query
4. Click session to load timeline
5. Expand Stage 1 node
6. Verify tool calls visible
7. Expand tool call to see Tavily query
8. Copy JSON input
9. Verify navigation back works

### Manual Testing Checklist
- [ ] Sessions list displays all research queries
- [ ] Full query text visible without truncation
- [ ] LogId copyable
- [ ] Timeline renders with 3 stages
- [ ] Stages expand/collapse smoothly
- [ ] Tool calls nested correctly
- [ ] JSON viewer shows complete input/output
- [ ] Copy buttons work
- [ ] Search filters sessions
- [ ] Link from result card opens correct session
- [ ] Browser back/forward works

## Implementation Summary

### Backend Changes
```
src/logs/
├── logs.module.ts
├── logs.controller.ts
├── logs.service.ts
├── dto/
│   ├── query-sessions.dto.ts
│   ├── log-session.dto.ts
│   └── log-detail.dto.ts
└── logs.service.spec.ts
```

### Frontend Changes
```
client/src/app/
├── features/logs/
│   ├── logs-page.ts/html/scss
│   ├── components/
│   │   ├── logs-list/
│   │   ├── log-timeline/
│   │   ├── stage-node/
│   │   ├── tool-node/
│   │   └── json-viewer/
│   └── services/
│       └── logs.service.ts
├── shared/components/
│   └── app-header/
└── models/
    ├── log-session.model.ts
    ├── timeline-node.model.ts
    └── log-entry.model.ts (updated)
```

### SCSS Updates
```
client/src/styles/
├── _variables.scss (add timeline colors)
└── _animations.scss (NEW - shimmer animation)
```

### Routing
- Add RouterModule to app.config.ts
- Define routes in app.routes.ts
- Update app.component.ts to include header and router-outlet

## Success Criteria

**Functional:**
- ✅ Can view all research sessions
- ✅ Can search/filter sessions by query text or logId
- ✅ Can select session to view timeline
- ✅ Timeline shows all 3 stages with durations
- ✅ Can expand stages to see input/output
- ✅ Can expand tool calls to see search queries and results
- ✅ Can copy JSON data
- ✅ Can navigate from result card to logs

**Non-Functional:**
- ✅ Visually appealing with color-coded stages
- ✅ Responsive design (desktop, tablet, mobile)
- ✅ Fast loading with caching (60s backend cache)
- ✅ Complete data visibility (no truncation in UI)
- ✅ Smooth animations and transitions
- ✅ Accessible (keyboard navigation, ARIA labels)

**Debugging Capability:**
- ✅ Can trace Denmark election query through all stages
- ✅ Can see what search queries were generated
- ✅ Can see what sources Tavily returned
- ✅ Can identify where municipality election news was filtered
- ✅ Can verify synthesis received correct context

## Future Enhancements (Post-MVP)

- Export logs as JSON file
- Share log session via URL
- Compare two sessions side-by-side
- Real-time log streaming (WebSocket)
- Analytics dashboard (avg duration by stage, tool usage stats)
- Diff viewer for comparing queries
- Highlighting for errors/warnings in timeline
- Download timeline as PNG
- LLM message viewer (see actual prompts sent to Ollama)
