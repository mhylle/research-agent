# Log Visualization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build log visualization feature enabling developers to debug the 3-stage research pipeline by viewing timeline of stages, tool calls, and input/output data for each research session.

**Architecture:** Backend LogsModule with API endpoints to serve log data from research-combined.log file. Frontend logs page with sessions list (sidebar) and timeline visualization (main area) using vertical expandable nodes. Integrated in existing Angular UI with routing.

**Tech Stack:** NestJS (backend), Angular 20 Signals (state), SCSS with BEM (styling), Winston logs (data source)

---

## Task 1: Backend - Create Logs Module and DTOs

**Files:**
- Create: `src/logs/logs.module.ts`
- Create: `src/logs/dto/log-session.dto.ts`
- Create: `src/logs/dto/log-detail.dto.ts`
- Create: `src/logs/dto/query-sessions.dto.ts`

**Step 1: Create log-session.dto.ts**

Create `src/logs/dto/log-session.dto.ts`:
```typescript
export class LogSessionDto {
  logId: string;
  query: string;
  timestamp: string;
  totalDuration: number;
  stageCount: number;
  toolCallCount: number;
  status: 'completed' | 'error' | 'incomplete';
}
```

**Step 2: Create log-detail.dto.ts**

Create `src/logs/dto/log-detail.dto.ts`:
```typescript
import { LogEntry } from '../../logging/interfaces/log-entry.interface';

export class LogDetailDto {
  logId: string;
  query: string;
  timestamp: string;
  totalDuration: number;
  status: 'completed' | 'error' | 'incomplete';
  entries: LogEntry[];
}
```

**Step 3: Create query-sessions.dto.ts**

Create `src/logs/dto/query-sessions.dto.ts`:
```typescript
import { IsOptional, IsNumber, IsString, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QuerySessionsDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['all', 'completed', 'error', 'incomplete'])
  status?: string = 'all';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
```

**Step 4: Create logs.module.ts**

Create `src/logs/logs.module.ts`:
```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class LogsModule {}
```

**Step 5: Register LogsModule in app.module.ts**

Modify `src/app.module.ts`:
```typescript
import { LogsModule } from './logs/logs.module';

@Module({
  imports: [
    // ... existing imports
    LogsModule,  // Add this
  ],
  // ...
})
export class AppModule {}
```

**Step 6: Commit**

```bash
git add src/logs/ src/app.module.ts
git commit -m "feat: create LogsModule with DTOs

- LogSessionDto for session summaries
- LogDetailDto for complete session data
- QuerySessionsDto for filtering/pagination
- LogsModule registered in AppModule"
```

---

## Task 2: Backend - Implement LogsService

**Files:**
- Create: `src/logs/logs.service.ts`
- Create: `src/logs/logs.service.spec.ts`

**Step 1: Write failing test**

Create `src/logs/logs.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LogsService } from './logs.service';
import * as fs from 'fs/promises';

jest.mock('fs/promises');

describe('LogsService', () => {
  let service: LogsService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'LOG_DIR') return './logs';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LogsService>(LogsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should parse log file and return sessions', async () => {
    const mockLogContent = `{"timestamp":"2025-11-20T10:00:00.000Z","logId":"test-123","stage":1,"component":"pipeline","operation":"stage_input","input":{"query":"test query"},"level":"info","message":"Stage input"}
{"timestamp":"2025-11-20T10:00:15.000Z","logId":"test-123","stage":1,"component":"pipeline","operation":"stage_output","executionTime":15000,"output":{},"level":"info","message":"Stage output"}`;

    (fs.readFile as jest.Mock).mockResolvedValue(mockLogContent);

    const result = await service.getAllSessions({});

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].logId).toBe('test-123');
    expect(result.sessions[0].query).toBe('test query');
  });
});
```

**Step 2: Run test**

Run:
```bash
npm test -- logs.service.spec.ts
```

Expected: FAIL with "Cannot find module './logs.service'"

**Step 3: Implement LogsService**

Create `src/logs/logs.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LogEntry } from '../logging/interfaces/log-entry.interface';
import { LogSessionDto } from './dto/log-session.dto';
import { LogDetailDto } from './dto/log-detail.dto';
import { QuerySessionsDto } from './dto/query-sessions.dto';

interface SessionsResult {
  sessions: LogSessionDto[];
  total: number;
}

@Injectable()
export class LogsService {
  private readonly logFilePath: string;
  private sessionsCache: Map<string, LogSessionDto> = new Map();
  private cacheExpiry = 0;

  constructor(private configService: ConfigService) {
    const logDir = this.configService.get<string>('LOG_DIR') || './logs';
    this.logFilePath = path.join(logDir, 'research-combined.log');
  }

  async getAllSessions(options: QuerySessionsDto): Promise<SessionsResult> {
    // Check cache validity
    if (Date.now() < this.cacheExpiry && this.sessionsCache.size > 0) {
      return this.filterAndPaginate(Array.from(this.sessionsCache.values()), options);
    }

    // Read and parse log file
    const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
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
    const sessions: LogSessionDto[] = Array.from(sessionsMap.entries()).map(([logId, entries]) => {
      return this.buildSessionSummary(logId, entries);
    });

    // Update cache
    this.sessionsCache = new Map(sessions.map(s => [s.logId, s]));
    this.cacheExpiry = Date.now() + 60000;  // 60 second cache

    return this.filterAndPaginate(sessions, options);
  }

  async getSessionDetails(logId: string): Promise<LogDetailDto> {
    const fileContent = await fs.readFile(this.logFilePath, 'utf-8');
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
      ),
    };
  }

  private buildSessionSummary(logId: string, entries: LogEntry[]): LogSessionDto {
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
    const stageSet = new Set(entries.filter(e => e.stage).map(e => e.stage));
    const stageCount = stageSet.size;
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
      status,
    };
  }

  private filterAndPaginate(sessions: LogSessionDto[], options: QuerySessionsDto): SessionsResult {
    let filtered = sessions;

    // Search filter
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(s =>
        s.query.toLowerCase().includes(searchLower) ||
        s.logId.includes(options.search)
      );
    }

    // Status filter
    if (options.status && options.status !== 'all') {
      filtered = filtered.filter(s => s.status === options.status);
    }

    // Date range filter
    if (options.from) {
      const fromDate = new Date(options.from);
      filtered = filtered.filter(s => new Date(s.timestamp) >= fromDate);
    }

    if (options.to) {
      const toDate = new Date(options.to);
      filtered = filtered.filter(s => new Date(s.timestamp) <= toDate);
    }

    // Sort by most recent first
    filtered.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Paginate
    const total = filtered.length;
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      sessions: paginated,
      total,
    };
  }
}
```

**Step 4: Run test**

Run:
```bash
npm test -- logs.service.spec.ts
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/logs/logs.service.ts src/logs/logs.service.spec.ts
git commit -m "feat: implement LogsService with session parsing

- Reads research-combined.log file
- Parses JSON log entries
- Groups by logId
- Builds session summaries with query, duration, status
- Filters and paginates results
- 60-second in-memory cache
- Comprehensive unit tests"
```

---

## Task 3: Backend - Create LogsController

**Files:**
- Create: `src/logs/logs.controller.ts`
- Create: `src/logs/logs.controller.spec.ts`
- Modify: `src/logs/logs.module.ts`

**Step 1: Write failing test**

Create `src/logs/logs.controller.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

describe('LogsController', () => {
  let controller: LogsController;
  let service: LogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LogsController],
      providers: [
        {
          provide: LogsService,
          useValue: {
            getAllSessions: jest.fn(),
            getSessionDetails: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LogsController>(LogsController);
    service = module.get<LogsService>(LogsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return sessions', async () => {
    const mockResult = {
      sessions: [{ logId: 'test', query: 'test query', timestamp: '', totalDuration: 1000, stageCount: 3, toolCallCount: 2, status: 'completed' as const }],
      total: 1,
    };

    jest.spyOn(service, 'getAllSessions').mockResolvedValue(mockResult);

    const result = await controller.getSessions({});

    expect(result).toEqual(mockResult);
    expect(service.getAllSessions).toHaveBeenCalledWith({});
  });

  it('should return session details', async () => {
    const mockDetail = {
      logId: 'test',
      query: 'test query',
      timestamp: '',
      totalDuration: 1000,
      status: 'completed' as const,
      entries: [],
    };

    jest.spyOn(service, 'getSessionDetails').mockResolvedValue(mockDetail);

    const result = await controller.getSessionDetails('test');

    expect(result).toEqual(mockDetail);
    expect(service.getSessionDetails).toHaveBeenCalledWith('test');
  });
});
```

**Step 2: Run test**

Run:
```bash
npm test -- logs.controller.spec.ts
```

Expected: FAIL with "Cannot find module './logs.controller'"

**Step 3: Implement LogsController**

Create `src/logs/logs.controller.ts`:
```typescript
import { Controller, Get, Param, Query } from '@nestjs/common';
import { LogsService } from './logs.service';
import { QuerySessionsDto } from './dto/query-sessions.dto';

@Controller('api/logs')
export class LogsController {
  constructor(private logsService: LogsService) {}

  @Get('sessions')
  async getSessions(@Query() query: QuerySessionsDto) {
    return this.logsService.getAllSessions(query);
  }

  @Get('sessions/:logId')
  async getSessionDetails(@Param('logId') logId: string) {
    return this.logsService.getSessionDetails(logId);
  }
}
```

**Step 4: Run test**

Run:
```bash
npm test -- logs.controller.spec.ts
```

Expected: PASS (3 tests)

**Step 5: Update logs.module.ts**

Modify `src/logs/logs.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
```

**Step 6: Test API endpoints**

Run:
```bash
npm run start:dev
```

Test in another terminal:
```bash
curl http://localhost:3000/api/logs/sessions | jq
```

Expected: Returns array of sessions from log file

**Step 7: Commit**

```bash
git add src/logs/
git commit -m "feat: add LogsController with API endpoints

- GET /api/logs/sessions - List all sessions
- GET /api/logs/sessions/:logId - Get session details
- Query params for filtering and pagination
- Comprehensive unit tests"
```

---

## Task 4: Frontend - Add Timeline Colors to SCSS Variables

**Files:**
- Modify: `client/src/styles/_variables.scss`

**Step 1: Add timeline color variables**

Modify `client/src/styles/_variables.scss`, add after existing color variables:
```scss
// Timeline colors (for log visualization)
$timeline-stage1: #3b82f6;   // Blue - Query Analysis
$timeline-stage2: #8b5cf6;   // Purple - Content Fetch
$timeline-stage3: #10b981;   // Green - Synthesis
$timeline-tool: #f59e0b;     // Orange - Tool calls
$timeline-line: #e5e7eb;     // Gray - Connector lines
$timeline-bg: #f9fafb;       // Light background
```

**Step 2: Create animations file**

Create `client/src/styles/_animations.scss`:
```scss
// Shimmer animation for loading skeletons
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

// Fade in animation
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// Expand animation
@keyframes expand {
  from {
    max-height: 0;
    opacity: 0;
  }
  to {
    max-height: 1000px;
    opacity: 1;
  }
}
```

**Step 3: Import animations in styles.scss**

Modify `client/src/styles.scss`:
```scss
@use 'styles/variables' as *;
@use 'styles/mixins' as *;
@use 'styles/reset';
@use 'styles/layout';
@use 'styles/typography';
@use 'styles/animations';  // Add this line
```

**Step 4: Commit**

```bash
git add client/src/styles/
git commit -m "feat: add timeline colors and animations to SCSS

- Timeline color palette for stages and tools
- Shimmer animation for loading skeletons
- Fade in and expand animations
- Imported in main styles.scss"
```

---

## Task 5: Frontend - Create TypeScript Models

**Files:**
- Create: `client/src/app/models/log-session.model.ts`
- Create: `client/src/app/models/log-detail.model.ts`
- Create: `client/src/app/models/timeline-node.model.ts`
- Modify: `client/src/app/models/index.ts`

**Step 1: Create log-session.model.ts**

Create `client/src/app/models/log-session.model.ts`:
```typescript
export interface LogSession {
  logId: string;
  query: string;
  timestamp: string;
  totalDuration: number;
  stageCount: number;
  toolCallCount: number;
  status: 'completed' | 'error' | 'incomplete';
}

export interface SessionsResponse {
  sessions: LogSession[];
  total: number;
}
```

**Step 2: Create log-detail.model.ts**

Create `client/src/app/models/log-detail.model.ts`:
```typescript
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

export interface LogDetail {
  logId: string;
  query: string;
  timestamp: string;
  totalDuration: number;
  status: 'completed' | 'error' | 'incomplete';
  entries: LogEntry[];
}
```

**Step 3: Create timeline-node.model.ts**

Create `client/src/app/models/timeline-node.model.ts`:
```typescript
export interface TimelineNode {
  type: 'stage' | 'tool';
  id: string;
  name: string;
  icon: string;
  color: string;
  duration: number;
  timestamp: string;
  input?: any;
  output?: any;
  children?: TimelineNode[];
  isExpanded: boolean;
}
```

**Step 4: Update barrel export**

Modify `client/src/app/models/index.ts`:
```typescript
export * from './research-query.model';
export * from './research-result.model';
export * from './error-response.model';
export * from './log-session.model';
export * from './log-detail.model';
export * from './timeline-node.model';
```

**Step 5: Commit**

```bash
git add client/src/app/models/
git commit -m "feat: add log visualization TypeScript models

- LogSession and SessionsResponse interfaces
- LogDetail and LogEntry interfaces
- TimelineNode interface for visualization
- Updated barrel exports"
```

---

## Task 6: Frontend - Implement LogsService (Angular)

**Files:**
- Create: `client/src/app/core/services/logs.service.ts`
- Create: `client/src/app/core/services/logs.service.spec.ts`

**Step 1: Write failing test**

Create `client/src/app/core/services/logs.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LogsService } from './logs.service';
import { LogSession } from '../../models';

describe('LogsService', () => {
  let service: LogsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LogsService]
    });
    service = TestBed.inject(LogsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load sessions', async () => {
    const mockSessions: LogSession[] = [
      { logId: 'test', query: 'test query', timestamp: '', totalDuration: 1000, stageCount: 3, toolCallCount: 2, status: 'completed' }
    ];

    const promise = service.loadSessions();

    const req = httpMock.expectOne(req => req.url.includes('/api/logs/sessions'));
    req.flush({ sessions: mockSessions, total: 1 });

    await promise;

    expect(service.sessions().length).toBe(1);
    expect(service.sessions()[0].logId).toBe('test');
  });
});
```

**Step 2: Run test**

Run:
```bash
cd client && npm test -- --watch=false
```

Expected: FAIL

**Step 3: Implement LogsService**

Create `client/src/app/core/services/logs.service.ts`:
```typescript
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LogSession, LogDetail, TimelineNode } from '../../models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LogsService {
  // Signals
  sessions = signal<LogSession[]>([]);
  selectedLogId = signal<string | null>(null);
  logDetail = signal<LogDetail | null>(null);
  isLoadingSessions = signal<boolean>(false);
  isLoadingDetails = signal<boolean>(false);
  searchTerm = signal<string>('');
  statusFilter = signal<'all' | 'completed' | 'error'>('all');
  error = signal<string | null>(null);

  // Computed
  filteredSessions = computed(() => {
    let filtered = this.sessions();

    // Search filter (client-side for responsiveness)
    const search = this.searchTerm().toLowerCase();
    if (search) {
      filtered = filtered.filter(s =>
        s.query.toLowerCase().includes(search) ||
        s.logId.includes(search)
      );
    }

    // Status filter
    const status = this.statusFilter();
    if (status !== 'all') {
      filtered = filtered.filter(s => s.status === status);
    }

    return filtered;
  });

  selectedSession = computed(() =>
    this.sessions().find(s => s.logId === this.selectedLogId())
  );

  timelineNodes = computed(() => {
    const detail = this.logDetail();
    if (!detail) return [];
    return this.buildTimelineFromEntries(detail.entries);
  });

  constructor(private http: HttpClient) {}

  async loadSessions(): Promise<void> {
    this.isLoadingSessions.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.get<{ sessions: LogSession[], total: number }>(
          `${environment.apiUrl}/logs/sessions`,
          { params: new HttpParams().set('limit', '200') }
        )
      );

      this.sessions.set(response.sessions);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to load sessions');
    } finally {
      this.isLoadingSessions.set(false);
    }
  }

  async selectSession(logId: string): Promise<void> {
    this.selectedLogId.set(logId);
    this.isLoadingDetails.set(true);
    this.error.set(null);

    try {
      const detail = await firstValueFrom(
        this.http.get<LogDetail>(`${environment.apiUrl}/logs/sessions/${logId}`)
      );

      this.logDetail.set(detail);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to load log details');
    } finally {
      this.isLoadingDetails.set(false);
    }
  }

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

      if (!stageInput) continue;

      // Find tool calls within this stage
      const toolCalls = entries.filter(e =>
        e.component !== 'pipeline' &&
        e.operation === 'execute' &&
        e.timestamp >= stageInput.timestamp &&
        (!stageOutput || e.timestamp <= stageOutput.timestamp)
      );

      // Build tool nodes
      const toolNodes: TimelineNode[] = toolCalls.map((tool, idx) => ({
        type: 'tool',
        id: `stage${stageNum}-tool${idx}`,
        name: this.getToolDisplayName(tool.component),
        icon: this.getToolIcon(tool.component),
        color: '#f59e0b',
        duration: tool.executionTime || 0,
        timestamp: tool.timestamp,
        input: tool.input,
        output: this.parseToolOutput(tool.output),
        isExpanded: false
      }));

      // Calculate duration
      const duration = stageOutput?.executionTime ||
        (stageOutput && stageInput ?
          new Date(stageOutput.timestamp).getTime() - new Date(stageInput.timestamp).getTime() :
          0);

      // Build stage node
      stages.push({
        type: 'stage',
        id: `stage${stageNum}`,
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

  private parseToolOutput(output: any): any {
    // Tool output might be stringified JSON, parse if needed
    if (typeof output === 'string') {
      try {
        return JSON.parse(output);
      } catch {
        return output;
      }
    }
    return output;
  }

  clearError(): void {
    this.error.set(null);
  }
}
```

**Step 4: Run test**

Run:
```bash
cd client && npm test -- --watch=false
```

Expected: PASS (all tests including 2 new ones)

**Step 5: Commit**

```bash
git add client/src/app/core/services/logs.service.ts client/src/app/core/services/logs.service.spec.ts
git commit -m "feat: implement LogsService (Angular) with Signals

- Signal-based state for sessions and selected session
- Timeline building logic from flat log entries
- HTTP integration with backend API
- Computed signals for filtering and timeline
- Helper methods for stage/tool display names and icons
- Comprehensive unit tests"
```

---

## Task 7: Frontend - Enable Routing

**Files:**
- Create: `client/src/app/app.routes.ts`
- Modify: `client/src/app/app.config.ts`
- Modify: `client/src/app/app.ts`

**Step 1: Create app.routes.ts**

Create `client/src/app/app.routes.ts`:
```typescript
import { Routes } from '@angular/router';
import { ResearchComponent } from './features/research/research';

export const routes: Routes = [
  {
    path: '',
    component: ResearchComponent
  }
];
```

**Step 2: Update app.config.ts**

Modify `client/src/app/app.config.ts`:
```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([errorInterceptor])
    )
  ]
};
```

**Step 3: Update app.ts to use router**

Modify `client/src/app/app.ts`:
```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: []
})
export class AppComponent {}
```

**Step 4: Test routing**

Run:
```bash
cd client && ng serve
```

Open browser to `http://localhost:4200`

Expected: Research component still renders (on default route)

**Step 5: Commit**

```bash
git add client/src/app/app.routes.ts client/src/app/app.config.ts client/src/app/app.ts
git commit -m "feat: enable Angular routing

- Created app.routes.ts with default route
- Registered router in app.config.ts
- Updated AppComponent to use router-outlet
- Routing ready for logs page"
```

---

## Task 8: Frontend - Create AppHeaderComponent

**Files:**
- Create: `client/src/app/shared/components/app-header/app-header.ts`
- Create: `client/src/app/shared/components/app-header/app-header.html`
- Create: `client/src/app/shared/components/app-header/app-header.scss`

**Step 1: Generate component**

Run:
```bash
cd client && ng generate component shared/components/app-header --standalone
```

**Step 2: Implement TypeScript**

Modify `client/src/app/shared/components/app-header/app-header.ts`:
```typescript
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './app-header.html',
  styleUrls: ['./app-header.scss']
})
export class AppHeaderComponent {}
```

**Step 3: Implement template**

Modify `client/src/app/shared/components/app-header/app-header.html`:
```html
<header class="app-header">
  <h1 class="app-header__title">
    <a routerLink="/" class="app-header__logo">Research Agent</a>
  </h1>
  <nav class="app-header__nav">
    <a
      routerLink="/"
      routerLinkActive="app-header__link--active"
      [routerLinkActiveOptions]="{exact: true}"
      class="app-header__link"
    >
      Research
    </a>
    <a
      routerLink="/logs"
      routerLinkActive="app-header__link--active"
      class="app-header__link"
    >
      Logs
    </a>
  </nav>
</header>
```

**Step 4: Implement styles**

Modify `client/src/app/shared/components/app-header/app-header.scss`:
```scss
@use '../../../../styles/variables' as *;
@use '../../../../styles/mixins' as *;

.app-header {
  @include flex-between;
  padding: $spacing-md $spacing-lg;
  background: $bg-primary;
  border-bottom: 1px solid $border;
  box-shadow: $shadow-sm;

  &__title {
    margin: 0;
    font-size: $font-size-xl;
    font-weight: $font-bold;
  }

  &__logo {
    color: $text-primary;
    text-decoration: none;

    &:hover {
      color: $primary;
    }
  }

  &__nav {
    display: flex;
    gap: $spacing-md;
  }

  &__link {
    padding: $spacing-xs $spacing-md;
    color: $text-secondary;
    text-decoration: none;
    font-weight: $font-medium;
    border-radius: $border-radius-sm;
    transition: all $transition-fast;

    &:hover {
      color: $primary;
      background: $bg-secondary;
    }

    &--active {
      color: $primary;
      background: lighten($primary, 45%);
    }
  }
}
```

**Step 5: Update AppComponent**

Modify `client/src/app/app.ts`:
```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from './shared/components/app-header/app-header';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppHeaderComponent],
  template: `
    <app-header />
    <router-outlet />
  `,
  styles: []
})
export class AppComponent {}
```

**Step 6: Test in browser**

Run:
```bash
cd client && ng serve
```

Expected: Header visible with Research/Logs navigation

**Step 7: Commit**

```bash
git add client/src/app/shared/components/app-header/ client/src/app/app.ts
git commit -m "feat: add AppHeaderComponent with navigation

- Header with title and navigation links
- Research and Logs links with active states
- RouterModule integration
- Updated AppComponent to include header"
```

---

## Task 9: Frontend - Create JsonViewerComponent

**Files:**
- Create: `client/src/app/features/logs/components/json-viewer/json-viewer.ts`
- Create: `client/src/app/features/logs/components/json-viewer/json-viewer.html`
- Create: `client/src/app/features/logs/components/json-viewer/json-viewer.scss`

**Step 1: Generate component**

Run:
```bash
cd client && ng generate component features/logs/components/json-viewer --standalone
```

**Step 2: Implement TypeScript**

Modify `client/src/app/features/logs/components/json-viewer/json-viewer.ts`:
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-json-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-viewer.html',
  styleUrls: ['./json-viewer.scss']
})
export class JsonViewerComponent {
  @Input() title = 'Data';
  @Input() data: any;

  isExpanded = false;
  showRaw = false;

  get formattedJson(): string {
    const json = JSON.stringify(this.data, null, 2);
    return this.syntaxHighlight(json);
  }

  get rawJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  get needsExpansion(): boolean {
    return this.rawJson.split('\n').length > 15;
  }

  get hasData(): boolean {
    return this.data !== null && this.data !== undefined;
  }

  private syntaxHighlight(json: string): string {
    return json.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
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

  copyJson(): void {
    navigator.clipboard.writeText(this.rawJson).then(() => {
      alert('Copied to clipboard!');
    });
  }

  expand(): void {
    this.isExpanded = true;
  }

  toggleRaw(): void {
    this.showRaw = !this.showRaw;
  }
}
```

**Step 3: Implement template**

Modify `client/src/app/features/logs/components/json-viewer/json-viewer.html`:
```html
<div class="json-viewer" *ngIf="hasData">
  <div class="json-viewer__header">
    <span class="json-viewer__title">{{ title }}</span>
    <div class="json-viewer__actions">
      <button class="json-viewer__copy-btn" (click)="copyJson()">
        📋 Copy
      </button>
      <button class="json-viewer__copy-btn" (click)="toggleRaw()">
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

**Step 4: Implement styles**

Modify `client/src/app/features/logs/components/json-viewer/json-viewer.scss`:
```scss
@use '../../../../../styles/variables' as *;
@use '../../../../../styles/mixins' as *;

.json-viewer {
  background: #1e1e1e;
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
    color: #9cdcfe;
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

    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
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
:host ::ng-deep {
  .json-key { color: #9cdcfe; }
  .json-string { color: #ce9178; }
  .json-number { color: #b5cea8; }
  .json-boolean { color: #569cd6; }
  .json-null { color: #569cd6; }
}
```

**Step 5: Commit**

```bash
git add client/src/app/features/logs/components/json-viewer/
git commit -m "feat: add JsonViewerComponent

- Syntax-highlighted JSON display
- Expandable for large content
- Copy to clipboard button
- Raw/Formatted toggle
- Dark theme code editor style"
```

---

## Task 10: Frontend - Create StageNodeComponent and ToolNodeComponent

**Files:**
- Create: `client/src/app/features/logs/components/stage-node/stage-node.ts`
- Create: `client/src/app/features/logs/components/stage-node/stage-node.html`
- Create: `client/src/app/features/logs/components/stage-node/stage-node.scss`
- Create: `client/src/app/features/logs/components/tool-node/tool-node.ts`
- Create: `client/src/app/features/logs/components/tool-node/tool-node.html`
- Create: `client/src/app/features/logs/components/tool-node/tool-node.scss`

**Step 1: Generate both components**

Run:
```bash
cd client && ng generate component features/logs/components/stage-node --standalone
cd client && ng generate component features/logs/components/tool-node --standalone
```

**Step 2: Implement ToolNodeComponent (simpler, no nesting)**

Modify `client/src/app/features/logs/components/tool-node/tool-node.ts`:
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineNode } from '../../../../models';
import { JsonViewerComponent } from '../json-viewer/json-viewer';

@Component({
  selector: 'app-tool-node',
  standalone: true,
  imports: [CommonModule, JsonViewerComponent],
  templateUrl: './tool-node.html',
  styleUrls: ['./tool-node.scss']
})
export class ToolNodeComponent {
  @Input() node!: TimelineNode;

  toggleExpand(): void {
    this.node.isExpanded = !this.node.isExpanded;
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }
}
```

Modify `client/src/app/features/logs/components/tool-node/tool-node.html`:
```html
<div class="tool-node">
  <div class="tool-node__header" (click)="toggleExpand()">
    <div class="tool-node__info">
      <span class="tool-node__icon">{{ node.icon }}</span>
      <span class="tool-node__name">{{ node.name }}</span>
    </div>
    <div class="tool-node__meta">
      <span class="tool-node__duration">{{ formatDuration(node.duration) }}</span>
      <span class="tool-node__expand-icon" [class.tool-node__expand-icon--expanded]="node.isExpanded">
        ▶
      </span>
    </div>
  </div>

  <div class="tool-node__content" *ngIf="node.isExpanded">
    <app-json-viewer title="Input" [data]="node.input" />
    <app-json-viewer title="Output" [data]="node.output" *ngIf="node.output" />
  </div>
</div>
```

Modify `client/src/app/features/logs/components/tool-node/tool-node.scss`:
```scss
@use '../../../../../styles/variables' as *;
@use '../../../../../styles/mixins' as *;

.tool-node {
  background: $bg-primary;
  border-left: 2px solid $timeline-tool;
  padding: $spacing-sm;
  margin: $spacing-sm 0;
  border-radius: $border-radius-sm;
  transition: box-shadow $transition-fast;

  &:hover {
    box-shadow: $shadow-sm;
  }

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

  &__meta {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__duration {
    font-size: $font-size-xs;
    color: $text-muted;
    font-family: 'Monaco', monospace;
  }

  &__expand-icon {
    color: $text-muted;
    font-size: $font-size-xs;
    transition: transform $transition-fast;

    &--expanded {
      transform: rotate(90deg);
    }
  }

  &__content {
    padding-top: $spacing-sm;
    border-top: 1px solid $border;
    margin-top: $spacing-sm;
  }
}
```

**Step 3: Implement StageNodeComponent**

Modify `client/src/app/features/logs/components/stage-node/stage-node.ts`:
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineNode } from '../../../../models';
import { JsonViewerComponent } from '../json-viewer/json-viewer';
import { ToolNodeComponent } from '../tool-node/tool-node';

@Component({
  selector: 'app-stage-node',
  standalone: true,
  imports: [CommonModule, JsonViewerComponent, ToolNodeComponent],
  templateUrl: './stage-node.html',
  styleUrls: ['./stage-node.scss']
})
export class StageNodeComponent {
  @Input() node!: TimelineNode;
  @Input() isLast = false;

  toggleExpand(): void {
    this.node.isExpanded = !this.node.isExpanded;
  }

  formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
```

Modify `client/src/app/features/logs/components/stage-node/stage-node.html`:
```html
<div class="stage-node" [style.--stage-color]="node.color">
  <div class="stage-node__header" (click)="toggleExpand()">
    <div class="stage-node__title">
      <span class="stage-node__icon">{{ node.icon }}</span>
      <span class="stage-node__name">{{ node.name }}</span>
    </div>
    <div class="stage-node__meta">
      <span class="stage-node__duration">{{ formatDuration(node.duration) }}</span>
      <span class="stage-node__expand-icon" [class.stage-node__expand-icon--expanded]="node.isExpanded">
        ▶
      </span>
    </div>
  </div>

  <div class="stage-node__content" *ngIf="node.isExpanded">
    <div class="stage-node__io">
      <app-json-viewer title="Input" [data]="node.input" />
      <app-json-viewer title="Output" [data]="node.output" *ngIf="node.output" />
    </div>

    <div class="stage-node__children" *ngIf="node.children && node.children.length > 0">
      <h4 class="stage-node__children-title">Tool Calls ({{ node.children.length }})</h4>
      <app-tool-node
        *ngFor="let tool of node.children"
        [node]="tool"
      />
    </div>
  </div>

  <div class="stage-node__connector" *ngIf="!isLast"></div>
</div>
```

Modify `client/src/app/features/logs/components/stage-node/stage-node.scss`:
```scss
@use '../../../../../styles/variables' as *;
@use '../../../../../styles/mixins' as *;

.stage-node {
  @include card;
  border-left: 4px solid var(--stage-color);
  margin-bottom: $spacing-lg;
  position: relative;
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
    font-size: $font-size-lg;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: $spacing-md;
  }

  &__duration {
    font-size: $font-size-sm;
    color: $text-secondary;
    padding: 4px 8px;
    background: $bg-tertiary;
    border-radius: $border-radius-sm;
    font-family: 'Monaco', monospace;
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

  &__io {
    margin: $spacing-md 0;
  }

  &__children {
    margin-top: $spacing-md;
    padding-left: $spacing-md;
    border-left: 2px dashed $timeline-line;
  }

  &__children-title {
    font-size: $font-size-sm;
    font-weight: $font-semibold;
    color: $text-secondary;
    margin-bottom: $spacing-sm;
  }

  &__connector {
    position: absolute;
    left: 20px;
    bottom: -$spacing-lg;
    width: 2px;
    height: $spacing-lg;
    background: $timeline-line;
  }
}
```

**Step 4: Commit**

```bash
git add client/src/app/features/logs/components/stage-node/
git add client/src/app/features/logs/components/tool-node/
git commit -m "feat: add StageNode and ToolNode components

StageNodeComponent:
- Stage header with icon, name, duration
- Expandable to show input/output
- Nested tool calls display
- Visual connector to next stage

ToolNodeComponent:
- Tool call header with icon and duration
- Expandable JSON viewer for input/output
- Orange accent color"
```

---

## Task 11: Frontend - Create LogTimelineComponent

**Files:**
- Create: `client/src/app/features/logs/components/log-timeline/log-timeline.ts`
- Create: `client/src/app/features/logs/components/log-timeline/log-timeline.html`
- Create: `client/src/app/features/logs/components/log-timeline/log-timeline.scss`

**Step 1: Generate component**

Run:
```bash
cd client && ng generate component features/logs/components/log-timeline --standalone
```

**Step 2: Implement TypeScript**

Modify `client/src/app/features/logs/components/log-timeline/log-timeline.ts`:
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineNode, LogSession } from '../../../../models';
import { StageNodeComponent } from '../stage-node/stage-node';

@Component({
  selector: 'app-log-timeline',
  standalone: true,
  imports: [CommonModule, StageNodeComponent],
  templateUrl: './log-timeline.html',
  styleUrls: ['./log-timeline.scss']
})
export class LogTimelineComponent {
  @Input() session!: LogSession;
  @Input() timelineNodes: TimelineNode[] = [];
  @Input() isLoading = false;

  copyLogId(): void {
    navigator.clipboard.writeText(this.session.logId).then(() => {
      alert('LogID copied to clipboard!');
    });
  }

  formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
```

**Step 3: Implement template**

Modify `client/src/app/features/logs/components/log-timeline/log-timeline.html`:
```html
<div class="log-timeline">
  <div class="log-timeline__header">
    <h2 class="log-timeline__query">{{ session.query }}</h2>
    <div class="log-timeline__meta">
      <span class="log-timeline__logid">
        LogID: {{ session.logId }}
        <button class="log-timeline__copy-btn" (click)="copyLogId()">📋</button>
      </span>
      <span class="log-timeline__duration">
        Total: {{ formatDuration(session.totalDuration) }}
      </span>
      <span class="log-timeline__status" [class]="'log-timeline__status--' + session.status">
        {{ session.status }}
      </span>
    </div>
  </div>

  <div class="log-timeline__loading" *ngIf="isLoading">
    <div class="skeleton-stage" *ngFor="let i of [1,2,3]">
      <div class="skeleton-stage__header"></div>
    </div>
  </div>

  <div class="log-timeline__stages" *ngIf="!isLoading">
    <app-stage-node
      *ngFor="let stage of timelineNodes; let i = index; let last = last"
      [node]="stage"
      [isLast]="last"
    />
  </div>

  <div class="log-timeline__empty" *ngIf="!isLoading && timelineNodes.length === 0">
    <p>No timeline data available for this session</p>
  </div>
</div>
```

**Step 4: Implement styles**

Modify `client/src/app/features/logs/components/log-timeline/log-timeline.scss`:
```scss
@use '../../../../../styles/variables' as *;
@use '../../../../../styles/mixins' as *;

.log-timeline {
  padding: $spacing-lg;
  max-width: 1200px;
  margin: 0 auto;

  &__header {
    margin-bottom: $spacing-xl;
  }

  &__query {
    font-size: $font-size-2xl;
    font-weight: $font-semibold;
    color: $text-primary;
    margin-bottom: $spacing-md;
    word-wrap: break-word;
    line-height: $line-height-tight;
  }

  &__meta {
    display: flex;
    gap: $spacing-md;
    flex-wrap: wrap;
    align-items: center;
  }

  &__logid {
    font-family: 'Monaco', monospace;
    font-size: $font-size-sm;
    color: $text-secondary;
    display: flex;
    align-items: center;
    gap: $spacing-xs;
  }

  &__copy-btn {
    @include button-reset;
    color: $primary;
    padding: 2px 4px;
    border-radius: $border-radius-sm;
    transition: background $transition-fast;

    &:hover {
      background: $bg-secondary;
    }
  }

  &__duration {
    font-size: $font-size-sm;
    color: $text-secondary;
    font-weight: $font-medium;
  }

  &__status {
    padding: 4px 8px;
    border-radius: $border-radius-sm;
    font-size: $font-size-xs;
    font-weight: $font-semibold;
    text-transform: uppercase;

    &--completed {
      background: lighten($success, 45%);
      color: darken($success, 10%);
    }

    &--error {
      background: lighten($error, 45%);
      color: darken($error, 10%);
    }

    &--incomplete {
      background: lighten($warning, 45%);
      color: darken($warning, 10%);
    }
  }

  &__stages {
    position: relative;
  }

  &__empty {
    @include card;
    text-align: center;
    padding: $spacing-xl;
    color: $text-secondary;

    p {
      margin: 0;
    }
  }

  &__loading {
    .skeleton-stage {
      @include card;
      margin-bottom: $spacing-lg;

      &__header {
        height: 60px;
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: $border-radius-sm;
      }
    }
  }
}
```

**Step 5: Commit**

```bash
git add client/src/app/features/logs/components/log-timeline/
git commit -m "feat: add LogTimelineComponent

- Timeline header with query, logId, duration, status
- Stage nodes rendering
- Loading skeletons for async data
- Empty state handling
- Copy logId to clipboard"
```

---

## Task 12: Frontend - Create LogsListComponent

**Files:**
- Create: `client/src/app/features/logs/components/logs-list/logs-list.ts`
- Create: `client/src/app/features/logs/components/logs-list/logs-list.html`
- Create: `client/src/app/features/logs/components/logs-list/logs-list.scss`

**Step 1: Generate component**

Run:
```bash
cd client && ng generate component features/logs/components/logs-list --standalone
```

**Step 2: Implement TypeScript**

Modify `client/src/app/features/logs/components/logs-list/logs-list.ts`:
```typescript
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogSession } from '../../../../models';

@Component({
  selector: 'app-logs-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './logs-list.html',
  styleUrls: ['./logs-list.scss']
})
export class LogsListComponent {
  @Input() sessions: LogSession[] = [];
  @Input() selectedLogId: string | null = null;
  @Input() isLoading = false;
  @Output() sessionSelected = new EventEmitter<string>();
  @Output() searchChanged = new EventEmitter<string>();

  searchTerm = '';

  onSearchChange(): void {
    this.searchChanged.emit(this.searchTerm);
  }

  selectSession(logId: string): void {
    this.sessionSelected.emit(logId);
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  getStatusIcon(status: string): string {
    const icons = {
      'completed': '✅',
      'error': '❌',
      'incomplete': '⏳'
    };
    return icons[status] || '📋';
  }

  truncateLogId(logId: string): string {
    if (logId.length <= 16) return logId;
    return `...${logId.slice(-12)}`;
  }
}
```

**Step 3: Implement template**

Modify `client/src/app/features/logs/components/logs-list/logs-list.html`:
```html
<div class="logs-list">
  <div class="logs-list__search">
    <input
      type="text"
      class="logs-list__search-input"
      placeholder="Search queries or logId..."
      [(ngModel)]="searchTerm"
      (ngModelChange)="onSearchChange()"
    />
    <span class="logs-list__count">{{ sessions.length }} session(s)</span>
  </div>

  <div class="logs-list__loading" *ngIf="isLoading">
    <div class="skeleton-item" *ngFor="let i of [1,2,3,4,5]">
      <div class="skeleton-line skeleton-line--title"></div>
      <div class="skeleton-line skeleton-line--meta"></div>
    </div>
  </div>

  <div class="logs-list__sessions" *ngIf="!isLoading">
    <div
      *ngFor="let session of sessions"
      class="logs-list__session-item"
      [class.logs-list__session-item--active]="session.logId === selectedLogId"
      (click)="selectSession(session.logId)"
    >
      <div class="logs-list__query">{{ session.query }}</div>
      <div class="logs-list__meta">
        <span class="logs-list__logid">{{ truncateLogId(session.logId) }}</span>
        <span class="logs-list__status-icon">{{ getStatusIcon(session.status) }}</span>
      </div>
      <div class="logs-list__footer">
        <span class="logs-list__timestamp">{{ formatTimestamp(session.timestamp) }}</span>
        <span class="logs-list__duration">{{ formatDuration(session.totalDuration) }}</span>
      </div>
    </div>

    <div class="logs-list__empty" *ngIf="sessions.length === 0">
      <p>No sessions found</p>
    </div>
  </div>
</div>
```

**Step 4: Implement styles**

Modify `client/src/app/features/logs/components/logs-list/logs-list.scss`:
```scss
@use '../../../../../styles/variables' as *;
@use '../../../../../styles/mixins' as *;

.logs-list {
  background: $bg-primary;
  border-right: 1px solid $border;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &__search {
    padding: $spacing-md;
    border-bottom: 1px solid $border;
    flex-shrink: 0;
  }

  &__search-input {
    width: 100%;
    padding: $spacing-sm;
    border: 1px solid $border;
    border-radius: $border-radius-sm;
    font-size: $font-size-sm;
    font-family: $font-family;

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

  &__loading {
    padding: $spacing-md;
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
    font-size: $font-size-sm;
  }

  &__meta {
    @include flex-between;
    margin-bottom: $spacing-xs;
  }

  &__logid {
    font-family: 'Monaco', monospace;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__status-icon {
    font-size: $font-size-sm;
  }

  &__footer {
    @include flex-between;
    font-size: $font-size-xs;
    color: $text-secondary;
  }

  &__timestamp {
    color: $text-secondary;
  }

  &__duration {
    padding: 2px 6px;
    background: $bg-tertiary;
    border-radius: $border-radius-sm;
    font-weight: $font-medium;
    font-family: 'Monaco', monospace;
  }

  &__empty {
    padding: $spacing-xl;
    text-align: center;
    color: $text-muted;

    p {
      margin: 0;
    }
  }
}

// Loading skeletons
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
    height: 18px;
    width: 85%;
    margin-bottom: $spacing-xs;
  }

  &--meta {
    height: 14px;
    width: 60%;
  }
}
```

**Step 5: Commit**

```bash
git add client/src/app/features/logs/components/logs-list/
git commit -m "feat: add LogsListComponent

- Session list with search input
- Shows full query text (word-wrapped)
- Displays logId (last 12 chars), timestamp, duration
- Status icon (✅/❌/⏳)
- Active selection state
- Loading skeletons
- Empty state"
```

---

## Task 13: Frontend - Create LogsPageComponent

**Files:**
- Create: `client/src/app/features/logs/logs-page.ts`
- Create: `client/src/app/features/logs/logs-page.html`
- Create: `client/src/app/features/logs/logs-page.scss`
- Modify: `client/src/app/app.routes.ts`

**Step 1: Generate component**

Run:
```bash
cd client && ng generate component features/logs/logs-page --standalone
```

**Step 2: Implement TypeScript**

Modify `client/src/app/features/logs/logs-page.ts`:
```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { LogsService } from '../../core/services/logs.service';
import { LogsListComponent } from './components/logs-list/logs-list';
import { LogTimelineComponent } from './components/log-timeline/log-timeline';

@Component({
  selector: 'app-logs-page',
  standalone: true,
  imports: [CommonModule, LogsListComponent, LogTimelineComponent],
  templateUrl: './logs-page.html',
  styleUrls: ['./logs-page.scss']
})
export class LogsPageComponent implements OnInit {
  logsService = inject(LogsService);
  route = inject(ActivatedRoute);

  ngOnInit() {
    this.logsService.loadSessions();

    // Handle route parameter for direct logId access
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

**Step 3: Implement template**

Modify `client/src/app/features/logs/logs-page.html`:
```html
<div class="logs-page">
  <aside class="logs-page__sidebar">
    <app-logs-list
      [sessions]="logsService.filteredSessions()"
      [selectedLogId]="logsService.selectedLogId()"
      [isLoading]="logsService.isLoadingSessions()"
      (sessionSelected)="onSessionSelected($event)"
      (searchChanged)="onSearchChanged($event)"
    />
  </aside>

  <main class="logs-page__content">
    <app-log-timeline
      *ngIf="logsService.selectedSession()"
      [session]="logsService.selectedSession()!"
      [timelineNodes]="logsService.timelineNodes()"
      [isLoading]="logsService.isLoadingDetails()"
    />

    <div class="logs-page__empty" *ngIf="!logsService.selectedSession() && !logsService.isLoadingSessions()">
      <div class="empty-state">
        <h3>Select a Research Session</h3>
        <p>Choose a session from the list to view its timeline and debug the research pipeline</p>
      </div>
    </div>
  </main>
</div>
```

**Step 4: Implement styles**

Modify `client/src/app/features/logs/logs-page.scss`:
```scss
@use '../../../styles/variables' as *;
@use '../../../styles/mixins' as *;

.logs-page {
  display: grid;
  grid-template-columns: 400px 1fr;
  height: calc(100vh - 60px);  // Account for header height

  @media (max-width: $breakpoint-md) {
    grid-template-columns: 1fr;
  }

  &__sidebar {
    overflow: hidden;

    @media (max-width: $breakpoint-md) {
      height: 50vh;
      border-bottom: 1px solid $border;
    }
  }

  &__content {
    background: $bg-secondary;
    overflow-y: auto;
  }

  &__empty {
    @include flex-center;
    height: 100%;
    padding: $spacing-xl;

    .empty-state {
      text-align: center;
      max-width: 400px;

      h3 {
        font-size: $font-size-xl;
        color: $text-primary;
        margin-bottom: $spacing-sm;
      }

      p {
        color: $text-secondary;
        margin: 0;
      }
    }
  }
}
```

**Step 5: Add logs route**

Modify `client/src/app/app.routes.ts`:
```typescript
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

**Step 6: Test in browser**

Run:
```bash
cd client && ng serve
```

Navigate to `http://localhost:4200/logs`

Expected: Logs page renders with sidebar and empty state

**Step 7: Commit**

```bash
git add client/src/app/features/logs/logs-page.* client/src/app/app.routes.ts
git commit -m "feat: add LogsPageComponent with routing

- Main logs page with sidebar/content layout
- Integrates LogsListComponent and LogTimelineComponent
- Route parameter handling for direct logId access
- Responsive grid layout
- Empty state for no selection
- Added /logs and /logs/:logId routes"
```

---

## Task 14: Frontend - Add "View Logs" Link to ResultCardComponent

**Files:**
- Modify: `client/src/app/features/research/components/result-card/result-card.ts`
- Modify: `client/src/app/features/research/components/result-card/result-card.html`
- Modify: `client/src/app/features/research/components/result-card/result-card.scss`

**Step 1: Update TypeScript to import RouterModule**

Modify `client/src/app/features/research/components/result-card/result-card.ts`:
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';  // Add this
import { ResearchResult } from '../../../../models';
import { SourcesListComponent } from '../sources-list/sources-list';

@Component({
  selector: 'app-result-card',
  standalone: true,
  imports: [CommonModule, SourcesListComponent, RouterModule],  // Add RouterModule
  templateUrl: './result-card.html',
  styleUrls: ['./result-card.scss']
})
export class ResultCardComponent {
  @Input() result!: ResearchResult;

  // ... existing methods
}
```

**Step 2: Add "View Logs" link to template**

Modify `client/src/app/features/research/components/result-card/result-card.html`:

Find the actions section and add the link:
```html
<div class="result-card__actions">
  <button
    type="button"
    class="result-card__action"
    (click)="copyAnswer()"
  >
    📋 Copy
  </button>
  <a
    [routerLink]="['/logs', result.logId]"
    class="result-card__action result-card__action--link"
  >
    🔍 View Logs
  </a>
</div>
```

**Step 3: Add link styles**

Modify `client/src/app/features/research/components/result-card/result-card.scss`:

Add at the end:
```scss
.result-card__action--link {
  text-decoration: none;
  display: inline-block;
}
```

**Step 4: Test in browser**

Run both servers, submit a query, verify "View Logs" link appears and navigates to logs page

**Step 5: Commit**

```bash
git add client/src/app/features/research/components/result-card/
git commit -m "feat: add View Logs link to ResultCardComponent

- RouterModule imported
- View Logs link with logId navigation
- Opens logs page with selected session
- Enables direct debugging from results"
```

---

## Task 15: Backend - Increase Log Data Retention

**Files:**
- Modify: `src/logging/research-logger.service.ts`

**Step 1: Update sanitize method to increase limit**

Modify `src/logging/research-logger.service.ts`:

Find the `sanitize` method and update:
```typescript
private sanitize(data: any): any {
  const str = JSON.stringify(data);
  if (str.length > 10000) {  // Increased from 1000 to 10000
    return str.substring(0, 10000) + '... [truncated]';
  }
  return data;
}
```

**Step 2: Run tests**

Run:
```bash
npm test -- research-logger.service.spec.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/logging/research-logger.service.ts
git commit -m "feat: increase log data retention limit

- Increased sanitize limit from 1KB to 10KB
- Allows more complete debugging data
- Adds [truncated] indicator when data is cut
- Supports Denmark election query debugging"
```

---

## Task 16: Integration Testing with Playwright

**Files:**
- Create: `test/logs.e2e-spec.ts`

**Step 1: Create E2E test**

Create `test/logs.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Logs API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/logs/sessions (GET) - should return sessions', () => {
    return request(app.getHttpServer())
      .get('/api/logs/sessions')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('sessions');
        expect(res.body).toHaveProperty('total');
        expect(Array.isArray(res.body.sessions)).toBe(true);
      });
  });

  it('/api/logs/sessions/:logId (GET) - should return session details', async () => {
    // First get sessions to find a valid logId
    const sessionsRes = await request(app.getHttpServer())
      .get('/api/logs/sessions');

    if (sessionsRes.body.sessions.length === 0) {
      console.log('No sessions in log file, skipping test');
      return;
    }

    const logId = sessionsRes.body.sessions[0].logId;

    return request(app.getHttpServer())
      .get(`/api/logs/sessions/${logId}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('logId', logId);
        expect(res.body).toHaveProperty('entries');
        expect(Array.isArray(res.body.entries)).toBe(true);
      });
  });

  it('/api/logs/sessions/:logId (GET) - should return 404 for invalid logId', () => {
    return request(app.getHttpServer())
      .get('/api/logs/sessions/invalid-log-id-that-does-not-exist')
      .expect(404);
  });
});
```

**Step 2: Run E2E test**

Run:
```bash
npm run test:e2e
```

Expected: PASS (3 tests)

**Step 3: Commit**

```bash
git add test/logs.e2e-spec.ts
git commit -m "test: add E2E tests for logs API

- Test GET /api/logs/sessions endpoint
- Test GET /api/logs/sessions/:logId endpoint
- Test 404 error handling for invalid logId
- Comprehensive integration testing"
```

---

## Task 17: Update README with Logs Feature

**Files:**
- Modify: `README.md`

**Step 1: Add Logs Visualization section**

Modify `README.md`, add after Frontend section:

```markdown
## Log Visualization (Debugging)

### Overview

The log visualization feature provides a visual timeline of the research pipeline, enabling developers to debug why specific information didn't make it into research results.

### Access

Navigate to `/logs` in the Angular UI or click "View Logs" on any result card.

### Features

**Sessions List:**
- View all research sessions with full query text
- Search by query text or logId
- Filter by status (completed/error/incomplete)
- See duration and timestamp for each session

**Timeline View:**
- Visual timeline of the 3-stage research pipeline
- Color-coded stages:
  - 🔍 Stage 1 (Blue): Query Analysis & Search
  - 📄 Stage 2 (Purple): Content Fetch & Selection
  - ✨ Stage 3 (Green): Synthesis & Answer Generation
- Expandable nodes to view input/output
- Nested tool calls (Tavily searches, web fetches)
- JSON viewer with syntax highlighting
- Copy input/output data to clipboard

### Debugging Workflow

**Example: Debug why Denmark municipality election news didn't appear**

1. Navigate to `/logs` page
2. Search for "Denmark" in the sessions list
3. Click the session to view timeline
4. Expand Stage 1 → See the 3 search queries generated by the LLM
5. Expand each tool call → See what results Tavily returned
6. Check if "municipality" or "kommunalvalg" appeared in search queries
7. Expand Stage 2 → See which sources were selected
8. Expand Stage 3 → See what context was provided to synthesis
9. Identify where relevant information was filtered out

### API Endpoints

Backend logs API:
- `GET /api/logs/sessions` - List all research sessions
- `GET /api/logs/sessions/:logId` - Get detailed timeline for a session

Query parameters:
- `limit` - Number of sessions to return (default 50, max 200)
- `offset` - Pagination offset
- `search` - Filter by query text or logId
- `status` - Filter by status (all/completed/error/incomplete)

### Log Data

Logs are stored in `./logs/research-combined.log` in JSON format:
- Permanent storage (logs never deleted)
- Structured JSON with timestamps
- Complete input/output data (10KB limit per entry)
- Grouped by logId for session correlation
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Log Visualization section to README

- Overview of debugging features
- Access instructions
- Timeline visualization details
- Debugging workflow example (Denmark query)
- API endpoints documentation
- Log storage information"
```

---

## Summary

**Total Tasks**: 17

**Implementation Delivers:**

**Backend (NestJS):**
1. ✅ LogsModule with DTOs
2. ✅ LogsService (log parsing, caching, filtering)
3. ✅ LogsController (2 API endpoints)
4. ✅ Increased log data retention (10KB)
5. ✅ E2E tests for logs API

**Frontend (Angular):**
6. ✅ Timeline color palette and animations
7. ✅ TypeScript models (LogSession, LogDetail, TimelineNode)
8. ✅ LogsService with Signals and timeline building
9. ✅ Routing enabled (provideRouter)
10. ✅ AppHeaderComponent (navigation)
11. ✅ JsonViewerComponent (syntax highlighting, copy)
12. ✅ StageNodeComponent (expandable timeline nodes)
13. ✅ ToolNodeComponent (nested tool calls)
14. ✅ LogsListComponent (sessions list with search)
15. ✅ LogsPageComponent (main container)
16. ✅ "View Logs" link in result cards
17. ✅ README documentation

**Ready For:**
- Debugging Denmark municipality election query
- Tracing any research pipeline to identify filtering issues
- Visual inspection of all stages, tool calls, inputs, outputs

**Testing:**
- Unit tests for all services and components
- E2E tests for API endpoints
- Browser testing of complete workflow

**Next Phase After Implementation:**
- Use logs to debug Denmark query
- Identify why municipality election news was filtered
- Improve search query generation based on findings
- Phase 3: Backend enhancements (PDF, Playwright, evaluation, caching)
