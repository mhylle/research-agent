# Agentic Planning System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the research agent from a fixed 3-stage pipeline into an agentic system with LLM-driven planning, dynamic re-planning, and comprehensive immutable logging.

**Architecture:** Planner LLM builds execution plans using tools. Orchestrator executes plans phase-by-phase, dispatching steps to specialized executors. All events logged immutably to database and streamed via SSE for real-time UI.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Ollama LLM, EventEmitter2, SSE

**Design Document:** `docs/plans/2025-01-24-agentic-planning-system-design.md`

---

## Phase 1: Core Interfaces

### Task 1: Plan Interfaces

**Files:**
- Create: `src/orchestration/interfaces/plan.interface.ts`
- Create: `src/orchestration/interfaces/phase.interface.ts`
- Create: `src/orchestration/interfaces/plan-step.interface.ts`

**Step 1: Create plan interface**

```typescript
// src/orchestration/interfaces/plan.interface.ts
import { Phase } from './phase.interface';

export type PlanStatus = 'planning' | 'executing' | 'replanning' | 'completed' | 'failed';

export interface Plan {
  id: string;
  query: string;
  status: PlanStatus;
  phases: Phase[];
  createdAt: Date;
  completedAt?: Date;
}
```

**Step 2: Create phase interface**

```typescript
// src/orchestration/interfaces/phase.interface.ts
import { PlanStep } from './plan-step.interface';

export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface Phase {
  id: string;
  planId: string;
  name: string;
  description?: string;
  status: PhaseStatus;
  steps: PlanStep[];
  replanCheckpoint: boolean;
  order: number;
}

export interface PhaseResult {
  status: 'completed' | 'failed';
  stepResults: StepResult[];
  error?: Error;
}

export interface StepResult {
  status: 'completed' | 'failed' | 'skipped';
  stepId: string;
  output?: any;
  error?: Error;
  input?: any;
}
```

**Step 3: Create plan-step interface**

```typescript
// src/orchestration/interfaces/plan-step.interface.ts
export type StepType = 'tool_call' | 'llm_call';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface PlanStep {
  id: string;
  phaseId: string;
  type: StepType;
  toolName: string;
  config: Record<string, any>;
  dependencies: string[];
  status: StepStatus;
  order: number;
}
```

**Step 4: Create barrel export**

```typescript
// src/orchestration/interfaces/index.ts
export * from './plan.interface';
export * from './phase.interface';
export * from './plan-step.interface';
```

**Step 5: Commit**

```bash
git add src/orchestration/interfaces/
git commit -m "feat(orchestration): add plan, phase, and step interfaces"
```

---

### Task 2: Executor Interfaces

**Files:**
- Create: `src/executors/interfaces/executor.interface.ts`
- Create: `src/executors/interfaces/executor-result.interface.ts`

**Step 1: Create executor result interface**

```typescript
// src/executors/interfaces/executor-result.interface.ts
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface ExecutorResult {
  output: any;
  tokensUsed?: TokenUsage;
  metadata?: Record<string, any>;
}
```

**Step 2: Create executor interface**

```typescript
// src/executors/interfaces/executor.interface.ts
import { PlanStep } from '../../orchestration/interfaces/plan-step.interface';
import { ExecutorResult } from './executor-result.interface';

export interface Executor {
  execute(step: PlanStep): Promise<ExecutorResult>;
}
```

**Step 3: Create barrel export**

```typescript
// src/executors/interfaces/index.ts
export * from './executor.interface';
export * from './executor-result.interface';
```

**Step 4: Commit**

```bash
git add src/executors/interfaces/
git commit -m "feat(executors): add executor and result interfaces"
```

---

### Task 3: Log Interfaces

**Files:**
- Create: `src/logging/interfaces/log-entry.interface.ts`
- Create: `src/logging/interfaces/log-query.interface.ts`
- Create: `src/logging/interfaces/log-event-type.enum.ts`

**Step 1: Create log event type enum**

```typescript
// src/logging/interfaces/log-event-type.enum.ts
export type LogEventType =
  // Planning events
  | 'plan_created'
  | 'phase_added'
  | 'step_added'
  | 'step_modified'
  | 'step_removed'
  // Execution events
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_skipped'
  // Re-planning events
  | 'replan_triggered'
  | 'replan_completed'
  // Session events
  | 'session_started'
  | 'session_completed'
  | 'session_failed';
```

**Step 2: Create log entry interface**

```typescript
// src/logging/interfaces/log-entry.interface.ts
import { LogEventType } from './log-event-type.enum';

export interface LogEntryData {
  input?: any;
  output?: any;
  prompt?: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  durationMs?: number;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface LogEntry {
  id: string;
  logId: string;
  timestamp: Date;
  eventType: LogEventType;
  planId?: string;
  phaseId?: string;
  stepId?: string;
  data: LogEntryData;
}

export type CreateLogEntry = Omit<LogEntry, 'id'>;
```

**Step 3: Create log query interface**

```typescript
// src/logging/interfaces/log-query.interface.ts
import { LogEventType } from './log-event-type.enum';

export interface LogQueryFilters {
  logId?: string;
  eventTypes?: LogEventType[];
  fromTime?: Date;
  toTime?: Date;
  stepId?: string;
  phaseId?: string;
  planId?: string;
  hasError?: boolean;
  limit?: number;
  offset?: number;
  order?: 'ASC' | 'DESC';
}

export interface SessionSummary {
  logId: string;
  startTime?: Date;
  endTime?: Date;
  totalDurationMs: number;
  totalTokens: number;
  phaseCount: number;
  stepCount: number;
  failureCount: number;
  replanCount: number;
  status: 'running' | 'completed' | 'failed';
}

export interface ExecutionMetrics {
  totalDurationMs: number;
  tokenBreakdown: Record<string, number>;
  durationByPhase: Record<string, number>;
  durationByTool: Record<string, number>;
  slowestSteps: Array<{ stepId: string; durationMs: number; toolName: string }>;
  tokenHeavySteps: Array<{ stepId: string; tokens: number; toolName: string }>;
}
```

**Step 4: Update barrel export**

```typescript
// src/logging/interfaces/index.ts
export * from './log-entry.interface';
export * from './log-query.interface';
export * from './log-event-type.enum';
```

**Step 5: Commit**

```bash
git add src/logging/interfaces/
git commit -m "feat(logging): add log entry, query, and event type interfaces"
```

---

### Task 4: Recovery Interfaces

**Files:**
- Create: `src/orchestration/interfaces/recovery.interface.ts`

**Step 1: Create recovery interfaces**

```typescript
// src/orchestration/interfaces/recovery.interface.ts
import { PlanStep } from './plan-step.interface';

export type RecoveryAction = 'retry' | 'skip' | 'alternative' | 'abort';

export interface RecoveryDecision {
  action: RecoveryAction;
  reason: string;
  modifications?: {
    retryWithConfig?: Record<string, any>;
    alternativeSteps?: PlanStep[];
  };
}

export interface FailureContext {
  planSummary: string;
  failedPhase: string;
  failedStep?: {
    stepId: string;
    toolName: string;
    config: any;
    error: {
      message: string;
      code?: string;
      stack?: string;
    };
  };
  completedSteps: string[];
  remainingPhases: string[];
}
```

**Step 2: Update barrel export**

```typescript
// src/orchestration/interfaces/index.ts
export * from './plan.interface';
export * from './phase.interface';
export * from './plan-step.interface';
export * from './recovery.interface';
```

**Step 3: Commit**

```bash
git add src/orchestration/interfaces/
git commit -m "feat(orchestration): add recovery interfaces"
```

---

## Phase 2: Logging Infrastructure

### Task 5: Log Entry Entity

**Files:**
- Create: `src/logging/entities/log-entry.entity.ts`

**Step 1: Create log entry entity**

```typescript
// src/logging/entities/log-entry.entity.ts
import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { LogEntryData } from '../interfaces/log-entry.interface';

@Entity('log_entries')
export class LogEntryEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  logId: string;

  @Column('timestamp with time zone')
  @Index()
  timestamp: Date;

  @Column('varchar', { length: 50 })
  @Index()
  eventType: string;

  @Column('uuid', { nullable: true })
  planId?: string;

  @Column('uuid', { nullable: true })
  phaseId?: string;

  @Column('uuid', { nullable: true })
  stepId?: string;

  @Column('jsonb')
  data: LogEntryData;
}
```

**Step 2: Commit**

```bash
git add src/logging/entities/
git commit -m "feat(logging): add log entry entity"
```

---

### Task 6: Log Service

**Files:**
- Create: `src/logging/log.service.ts`
- Create: `src/logging/log.service.spec.ts`

**Step 1: Write failing test for append method**

```typescript
// src/logging/log.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LogService } from './log.service';
import { LogEntryEntity } from './entities/log-entry.entity';
import { CreateLogEntry } from './interfaces/log-entry.interface';

describe('LogService', () => {
  let service: LogService;
  let mockRepository: any;
  let mockEventEmitter: any;

  beforeEach(async () => {
    mockRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogService,
        {
          provide: getRepositoryToken(LogEntryEntity),
          useValue: mockRepository,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<LogService>(LogService);
  });

  describe('append', () => {
    it('should create a log entry with generated id', async () => {
      const entry: CreateLogEntry = {
        logId: 'test-log-id',
        timestamp: new Date(),
        eventType: 'session_started',
        data: { query: 'test query' },
      };

      const result = await service.append(entry);

      expect(result.id).toBeDefined();
      expect(result.logId).toBe(entry.logId);
      expect(result.eventType).toBe(entry.eventType);
      expect(mockRepository.insert).toHaveBeenCalled();
    });

    it('should emit events for real-time streaming', async () => {
      const entry: CreateLogEntry = {
        logId: 'test-log-id',
        timestamp: new Date(),
        eventType: 'step_started',
        data: {},
      };

      await service.append(entry);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        `log.${entry.logId}`,
        expect.any(Object),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'log.all',
        expect.any(Object),
      );
    });
  });

  describe('getSessionLogs', () => {
    it('should return logs ordered by timestamp', async () => {
      const logs = [
        { id: '1', logId: 'test', timestamp: new Date(), eventType: 'session_started', data: {} },
      ];
      mockRepository.find.mockResolvedValue(logs);

      const result = await service.getSessionLogs('test');

      expect(result).toEqual(logs);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { logId: 'test' },
        order: { timestamp: 'ASC' },
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=log.service.spec.ts`
Expected: FAIL (LogService not found)

**Step 3: Implement LogService**

```typescript
// src/logging/log.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { LogEntryEntity } from './entities/log-entry.entity';
import { LogEntry, CreateLogEntry } from './interfaces/log-entry.interface';
import { LogQueryFilters, SessionSummary, ExecutionMetrics } from './interfaces/log-query.interface';
import { LogEventType } from './interfaces/log-event-type.enum';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(LogEntryEntity)
    private logRepository: Repository<LogEntryEntity>,
    private eventEmitter: EventEmitter2,
  ) {}

  async append(entry: CreateLogEntry): Promise<LogEntry> {
    const logEntry: LogEntry = {
      id: randomUUID(),
      ...entry,
      timestamp: entry.timestamp || new Date(),
    };

    await this.logRepository.insert(this.toEntity(logEntry));

    this.eventEmitter.emit(`log.${entry.logId}`, logEntry);
    this.eventEmitter.emit('log.all', logEntry);

    return logEntry;
  }

  async getSessionLogs(logId: string): Promise<LogEntry[]> {
    const entities = await this.logRepository.find({
      where: { logId },
      order: { timestamp: 'ASC' },
    });
    return entities.map((e) => this.fromEntity(e));
  }

  async getSessionSummary(logId: string): Promise<SessionSummary> {
    const logs = await this.getSessionLogs(logId);

    return {
      logId,
      startTime: logs[0]?.timestamp,
      endTime: logs[logs.length - 1]?.timestamp,
      totalDurationMs: this.calculateDuration(logs),
      totalTokens: this.sumTokens(logs),
      phaseCount: this.countEvents(logs, ['phase_completed']),
      stepCount: this.countEvents(logs, ['step_completed']),
      failureCount: this.countEvents(logs, ['step_failed', 'phase_failed']),
      replanCount: this.countEvents(logs, ['replan_triggered']),
      status: this.deriveStatus(logs),
    };
  }

  async queryLogs(filters: LogQueryFilters): Promise<LogEntry[]> {
    const query = this.logRepository.createQueryBuilder('log');

    if (filters.logId) {
      query.andWhere('log.logId = :logId', { logId: filters.logId });
    }
    if (filters.eventTypes?.length) {
      query.andWhere('log.eventType IN (:...types)', { types: filters.eventTypes });
    }
    if (filters.fromTime) {
      query.andWhere('log.timestamp >= :from', { from: filters.fromTime });
    }
    if (filters.toTime) {
      query.andWhere('log.timestamp <= :to', { to: filters.toTime });
    }
    if (filters.stepId) {
      query.andWhere("log.stepId = :stepId", { stepId: filters.stepId });
    }
    if (filters.phaseId) {
      query.andWhere("log.phaseId = :phaseId", { phaseId: filters.phaseId });
    }
    if (filters.hasError) {
      query.andWhere("log.data->>'error' IS NOT NULL");
    }

    query.orderBy('log.timestamp', filters.order || 'ASC');

    if (filters.limit) {
      query.limit(filters.limit);
    }
    if (filters.offset) {
      query.offset(filters.offset);
    }

    const entities = await query.getMany();
    return entities.map((e) => this.fromEntity(e));
  }

  async getExecutionMetrics(logId: string): Promise<ExecutionMetrics> {
    const logs = await this.getSessionLogs(logId);
    const stepLogs = logs.filter((l) => l.eventType === 'step_completed');

    return {
      totalDurationMs: this.calculateDuration(logs),
      tokenBreakdown: this.aggregateTokensByStep(stepLogs),
      durationByPhase: this.aggregateDurationByPhase(logs),
      durationByTool: this.aggregateDurationByTool(stepLogs),
      slowestSteps: this.findSlowestSteps(stepLogs, 5),
      tokenHeavySteps: this.findTokenHeavySteps(stepLogs, 5),
    };
  }

  private toEntity(entry: LogEntry): LogEntryEntity {
    const entity = new LogEntryEntity();
    entity.id = entry.id;
    entity.logId = entry.logId;
    entity.timestamp = entry.timestamp;
    entity.eventType = entry.eventType;
    entity.planId = entry.planId;
    entity.phaseId = entry.phaseId;
    entity.stepId = entry.stepId;
    entity.data = entry.data;
    return entity;
  }

  private fromEntity(entity: LogEntryEntity): LogEntry {
    return {
      id: entity.id,
      logId: entity.logId,
      timestamp: entity.timestamp,
      eventType: entity.eventType as LogEventType,
      planId: entity.planId,
      phaseId: entity.phaseId,
      stepId: entity.stepId,
      data: entity.data,
    };
  }

  private calculateDuration(logs: LogEntry[]): number {
    if (logs.length < 2) return 0;
    const start = logs[0].timestamp.getTime();
    const end = logs[logs.length - 1].timestamp.getTime();
    return end - start;
  }

  private sumTokens(logs: LogEntry[]): number {
    return logs.reduce((sum, log) => {
      return sum + (log.data.tokensUsed?.total || 0);
    }, 0);
  }

  private countEvents(logs: LogEntry[], eventTypes: string[]): number {
    return logs.filter((l) => eventTypes.includes(l.eventType)).length;
  }

  private deriveStatus(logs: LogEntry[]): 'running' | 'completed' | 'failed' {
    const lastEvent = logs[logs.length - 1];
    if (!lastEvent) return 'running';
    if (lastEvent.eventType === 'session_completed') return 'completed';
    if (lastEvent.eventType === 'session_failed') return 'failed';
    return 'running';
  }

  private aggregateTokensByStep(logs: LogEntry[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const log of logs) {
      const toolName = log.data.metadata?.toolName || log.data.toolName || 'unknown';
      const tokens = log.data.tokensUsed?.total || 0;
      result[toolName] = (result[toolName] || 0) + tokens;
    }
    return result;
  }

  private aggregateDurationByPhase(logs: LogEntry[]): Record<string, number> {
    const result: Record<string, number> = {};
    const phaseStarts: Record<string, number> = {};

    for (const log of logs) {
      if (log.eventType === 'phase_started' && log.phaseId) {
        phaseStarts[log.phaseId] = log.timestamp.getTime();
      }
      if ((log.eventType === 'phase_completed' || log.eventType === 'phase_failed') && log.phaseId) {
        const start = phaseStarts[log.phaseId];
        if (start) {
          const phaseName = log.data.phaseName || log.phaseId;
          result[phaseName] = log.timestamp.getTime() - start;
        }
      }
    }
    return result;
  }

  private aggregateDurationByTool(logs: LogEntry[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const log of logs) {
      const toolName = log.data.metadata?.toolName || log.data.toolName || 'unknown';
      const duration = log.data.durationMs || 0;
      result[toolName] = (result[toolName] || 0) + duration;
    }
    return result;
  }

  private findSlowestSteps(logs: LogEntry[], limit: number): Array<{ stepId: string; durationMs: number; toolName: string }> {
    return logs
      .filter((l) => l.data.durationMs)
      .map((l) => ({
        stepId: l.stepId || 'unknown',
        durationMs: l.data.durationMs || 0,
        toolName: l.data.metadata?.toolName || l.data.toolName || 'unknown',
      }))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, limit);
  }

  private findTokenHeavySteps(logs: LogEntry[], limit: number): Array<{ stepId: string; tokens: number; toolName: string }> {
    return logs
      .filter((l) => l.data.tokensUsed?.total)
      .map((l) => ({
        stepId: l.stepId || 'unknown',
        tokens: l.data.tokensUsed?.total || 0,
        toolName: l.data.metadata?.toolName || l.data.toolName || 'unknown',
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, limit);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=log.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/logging/log.service.ts src/logging/log.service.spec.ts
git commit -m "feat(logging): add immutable log service with query methods"
```

---

## Phase 3: Executors

### Task 7: Executor Registry

**Files:**
- Create: `src/executors/executor-registry.service.ts`
- Create: `src/executors/executor-registry.service.spec.ts`

**Step 1: Write failing test**

```typescript
// src/executors/executor-registry.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorRegistry } from './executor-registry.service';
import { Executor } from './interfaces/executor.interface';

describe('ExecutorRegistry', () => {
  let registry: ExecutorRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutorRegistry],
    }).compile();

    registry = module.get<ExecutorRegistry>(ExecutorRegistry);
  });

  describe('register', () => {
    it('should register an executor', () => {
      const mockExecutor: Executor = {
        execute: jest.fn(),
      };

      registry.register('test_type', mockExecutor);

      expect(registry.getExecutor('test_type')).toBe(mockExecutor);
    });
  });

  describe('getExecutor', () => {
    it('should throw if executor not found', () => {
      expect(() => registry.getExecutor('unknown')).toThrow(
        'No executor registered for type: unknown',
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=executor-registry.service.spec.ts`
Expected: FAIL

**Step 3: Implement ExecutorRegistry**

```typescript
// src/executors/executor-registry.service.ts
import { Injectable } from '@nestjs/common';
import { Executor } from './interfaces/executor.interface';

@Injectable()
export class ExecutorRegistry {
  private executors = new Map<string, Executor>();

  register(type: string, executor: Executor): void {
    this.executors.set(type, executor);
  }

  getExecutor(type: string): Executor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`No executor registered for type: ${type}`);
    }
    return executor;
  }

  hasExecutor(type: string): boolean {
    return this.executors.has(type);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.executors.keys());
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=executor-registry.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/executors/executor-registry.service.ts src/executors/executor-registry.service.spec.ts
git commit -m "feat(executors): add executor registry service"
```

---

### Task 8: Tool Executor

**Files:**
- Create: `src/executors/tool.executor.ts`
- Create: `src/executors/tool.executor.spec.ts`

**Step 1: Write failing test**

```typescript
// src/executors/tool.executor.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ToolExecutor } from './tool.executor';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let mockToolRegistry: any;

  beforeEach(async () => {
    mockToolRegistry = {
      execute: jest.fn().mockResolvedValue({ results: ['test'] }),
      getAllDefinitions: jest.fn().mockReturnValue([
        { name: 'tavily_search', description: 'Search' },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolExecutor,
        {
          provide: ToolRegistry,
          useValue: mockToolRegistry,
        },
      ],
    }).compile();

    executor = module.get<ToolExecutor>(ToolExecutor);
  });

  describe('execute', () => {
    it('should execute tool and return result', async () => {
      const step: PlanStep = {
        id: 'step-1',
        phaseId: 'phase-1',
        type: 'tool_call',
        toolName: 'tavily_search',
        config: { query: 'test query' },
        dependencies: [],
        status: 'pending',
        order: 0,
      };

      const result = await executor.execute(step);

      expect(mockToolRegistry.execute).toHaveBeenCalledWith('tavily_search', { query: 'test query' });
      expect(result.output).toEqual({ results: ['test'] });
      expect(result.metadata?.toolName).toBe('tavily_search');
    });
  });

  describe('getAvailableTools', () => {
    it('should return all tool definitions', () => {
      const tools = executor.getAvailableTools();

      expect(tools).toEqual([{ name: 'tavily_search', description: 'Search' }]);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=tool.executor.spec.ts`
Expected: FAIL

**Step 3: Implement ToolExecutor**

```typescript
// src/executors/tool.executor.ts
import { Injectable } from '@nestjs/common';
import { ToolRegistry } from '../tools/registry/tool-registry.service';
import { Executor } from './interfaces/executor.interface';
import { ExecutorResult } from './interfaces/executor-result.interface';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';

@Injectable()
export class ToolExecutor implements Executor {
  constructor(private toolRegistry: ToolRegistry) {}

  async execute(step: PlanStep): Promise<ExecutorResult> {
    const result = await this.toolRegistry.execute(step.toolName, step.config);

    return {
      output: result,
      metadata: {
        toolName: step.toolName,
        inputConfig: step.config,
      },
    };
  }

  getAvailableTools(): ToolDefinition[] {
    return this.toolRegistry.getAllDefinitions();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=tool.executor.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/executors/tool.executor.ts src/executors/tool.executor.spec.ts
git commit -m "feat(executors): add tool executor"
```

---

### Task 9: LLM Executor

**Files:**
- Create: `src/executors/llm.executor.ts`
- Create: `src/executors/llm.executor.spec.ts`

**Step 1: Write failing test**

```typescript
// src/executors/llm.executor.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { LLMExecutor } from './llm.executor';
import { OllamaService } from '../llm/ollama.service';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';

describe('LLMExecutor', () => {
  let executor: LLMExecutor;
  let mockOllamaService: any;

  beforeEach(async () => {
    mockOllamaService = {
      chat: jest.fn().mockResolvedValue({
        message: { role: 'assistant', content: 'Synthesized response' },
        prompt_eval_count: 100,
        eval_count: 50,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMExecutor,
        {
          provide: OllamaService,
          useValue: mockOllamaService,
        },
      ],
    }).compile();

    executor = module.get<LLMExecutor>(LLMExecutor);
  });

  describe('execute', () => {
    it('should execute LLM call and return result with token usage', async () => {
      const step: PlanStep = {
        id: 'step-1',
        phaseId: 'phase-1',
        type: 'llm_call',
        toolName: 'synthesize',
        config: {
          prompt: 'Summarize the following',
          context: 'Some context data',
          systemPrompt: 'You are a helpful assistant',
        },
        dependencies: [],
        status: 'pending',
        order: 0,
      };

      const result = await executor.execute(step);

      expect(result.output).toBe('Synthesized response');
      expect(result.tokensUsed).toEqual({
        prompt: 100,
        completion: 50,
        total: 150,
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=llm.executor.spec.ts`
Expected: FAIL

**Step 3: Implement LLMExecutor**

```typescript
// src/executors/llm.executor.ts
import { Injectable } from '@nestjs/common';
import { OllamaService } from '../llm/ollama.service';
import { Executor } from './interfaces/executor.interface';
import { ExecutorResult } from './interfaces/executor-result.interface';
import { PlanStep } from '../orchestration/interfaces/plan-step.interface';
import { ChatMessage } from '../llm/interfaces/chat-message.interface';

@Injectable()
export class LLMExecutor implements Executor {
  constructor(private llmService: OllamaService) {}

  async execute(step: PlanStep): Promise<ExecutorResult> {
    const messages: ChatMessage[] = [];

    if (step.config.systemPrompt) {
      messages.push({ role: 'system', content: step.config.systemPrompt });
    }

    if (step.config.context) {
      messages.push({ role: 'user', content: `Context:\n${step.config.context}` });
    }

    messages.push({ role: 'user', content: step.config.prompt });

    const response = await this.llmService.chat(messages);

    const promptTokens = response.prompt_eval_count || 0;
    const completionTokens = response.eval_count || 0;

    return {
      output: response.message.content,
      tokensUsed: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      metadata: {
        model: 'qwen2.5',
        loadDuration: response.load_duration,
        evalDuration: response.eval_duration,
      },
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=llm.executor.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/executors/llm.executor.ts src/executors/llm.executor.spec.ts
git commit -m "feat(executors): add LLM executor"
```

---

### Task 10: Executors Module

**Files:**
- Create: `src/executors/executors.module.ts`

**Step 1: Create executors module**

```typescript
// src/executors/executors.module.ts
import { Module } from '@nestjs/common';
import { ExecutorRegistry } from './executor-registry.service';
import { ToolExecutor } from './tool.executor';
import { LLMExecutor } from './llm.executor';
import { ToolsModule } from '../tools/tools.module';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [ToolsModule, LLMModule],
  providers: [ExecutorRegistry, ToolExecutor, LLMExecutor],
  exports: [ExecutorRegistry, ToolExecutor, LLMExecutor],
})
export class ExecutorsModule {}
```

**Step 2: Commit**

```bash
git add src/executors/executors.module.ts
git commit -m "feat(executors): add executors module"
```

---

## Phase 4: Planning Tools

### Task 11: Planning Tool Definitions

**Files:**
- Create: `src/orchestration/tools/planning-tools.ts`

**Step 1: Create planning tools definitions**

```typescript
// src/orchestration/tools/planning-tools.ts
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

export const planningTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_plan',
      description: 'Initialize a new execution plan for a research query',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The user research query',
          },
          name: {
            type: 'string',
            description: 'Short name for this plan',
          },
        },
        required: ['query', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_phase',
      description: 'Add a new phase to the plan',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Phase name (e.g., search, fetch, synthesize)',
          },
          description: {
            type: 'string',
            description: 'What this phase accomplishes',
          },
          replanCheckpoint: {
            type: 'boolean',
            description: 'Re-evaluate plan after this phase completes?',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_step',
      description: 'Add an execution step to a phase',
      parameters: {
        type: 'object',
        properties: {
          phaseId: {
            type: 'string',
            description: 'Target phase ID',
          },
          type: {
            type: 'string',
            enum: ['tool_call', 'llm_call'],
            description: 'Type of step',
          },
          toolName: {
            type: 'string',
            description: 'Tool to execute (e.g., tavily_search, web_fetch, synthesize)',
          },
          config: {
            type: 'object',
            description: 'Tool-specific parameters',
          },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            description: 'Step IDs that must complete before this step',
          },
        },
        required: ['phaseId', 'type', 'toolName', 'config'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modify_step',
      description: 'Modify an existing step configuration (during re-planning)',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to modify',
          },
          changes: {
            type: 'object',
            description: 'Fields to update',
          },
        },
        required: ['stepId', 'changes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_step',
      description: 'Remove a pending step from the plan',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to remove',
          },
          reason: {
            type: 'string',
            description: 'Why this step is no longer needed',
          },
        },
        required: ['stepId', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skip_phase',
      description: 'Mark an entire phase as skipped',
      parameters: {
        type: 'object',
        properties: {
          phaseId: {
            type: 'string',
            description: 'Phase ID to skip',
          },
          reason: {
            type: 'string',
            description: 'Why this phase should be skipped',
          },
        },
        required: ['phaseId', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_phase_after',
      description: 'Insert a new phase after an existing one (during re-planning)',
      parameters: {
        type: 'object',
        properties: {
          afterPhaseId: {
            type: 'string',
            description: 'Phase ID to insert after',
          },
          name: {
            type: 'string',
            description: 'New phase name',
          },
          description: {
            type: 'string',
            description: 'What this phase accomplishes',
          },
          replanCheckpoint: {
            type: 'boolean',
            description: 'Re-evaluate plan after this phase?',
          },
        },
        required: ['afterPhaseId', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_plan_status',
      description: 'Get current plan state for re-planning decisions',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_phase_results',
      description: 'Get detailed results from a completed phase',
      parameters: {
        type: 'object',
        properties: {
          phaseId: {
            type: 'string',
            description: 'Phase ID to get results for',
          },
        },
        required: ['phaseId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize_plan',
      description: 'Mark planning as complete and ready for execution',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];
```

**Step 2: Commit**

```bash
git add src/orchestration/tools/planning-tools.ts
git commit -m "feat(orchestration): add planning tool definitions"
```

---

### Task 12: Recovery Tool Definitions

**Files:**
- Create: `src/orchestration/tools/recovery-tools.ts`

**Step 1: Create recovery tools definitions**

```typescript
// src/orchestration/tools/recovery-tools.ts
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

export const recoveryTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'retry_step',
      description: 'Retry the failed step with optional modified configuration',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to retry',
          },
          modifiedConfig: {
            type: 'object',
            description: 'Optional modified parameters for retry',
          },
          reason: {
            type: 'string',
            description: 'Why retry is appropriate',
          },
        },
        required: ['stepId', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skip_step',
      description: 'Skip the failed step and continue execution',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to skip',
          },
          reason: {
            type: 'string',
            description: 'Why skipping is acceptable',
          },
        },
        required: ['stepId', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_step',
      description: 'Replace failed step with an alternative approach',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to replace',
          },
          alternativeToolName: {
            type: 'string',
            description: 'Alternative tool to use',
          },
          alternativeConfig: {
            type: 'object',
            description: 'Configuration for alternative tool',
          },
          reason: {
            type: 'string',
            description: 'Why this alternative is appropriate',
          },
        },
        required: ['stepId', 'alternativeToolName', 'alternativeConfig', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'abort_plan',
      description: 'Abort the entire plan - unrecoverable failure',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Why recovery is not possible',
          },
        },
        required: ['reason'],
      },
    },
  },
];
```

**Step 2: Create barrel export for tools**

```typescript
// src/orchestration/tools/index.ts
export * from './planning-tools';
export * from './recovery-tools';
```

**Step 3: Commit**

```bash
git add src/orchestration/tools/
git commit -m "feat(orchestration): add recovery tool definitions"
```

---

## Phase 5: Planner Service

### Task 13: Planner Service Implementation

**Files:**
- Create: `src/orchestration/planner.service.ts`
- Create: `src/orchestration/planner.service.spec.ts`

**Step 1: Write failing test**

```typescript
// src/orchestration/planner.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PlannerService } from './planner.service';
import { OllamaService } from '../llm/ollama.service';
import { ToolExecutor } from '../executors/tool.executor';
import { LogService } from '../logging/log.service';

describe('PlannerService', () => {
  let service: PlannerService;
  let mockOllamaService: any;
  let mockToolExecutor: any;
  let mockLogService: any;

  beforeEach(async () => {
    mockOllamaService = {
      chat: jest.fn(),
    };

    mockToolExecutor = {
      getAvailableTools: jest.fn().mockReturnValue([
        { type: 'function', function: { name: 'tavily_search', description: 'Search' } },
      ]),
    };

    mockLogService = {
      append: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerService,
        { provide: OllamaService, useValue: mockOllamaService },
        { provide: ToolExecutor, useValue: mockToolExecutor },
        { provide: LogService, useValue: mockLogService },
      ],
    }).compile();

    service = module.get<PlannerService>(PlannerService);
  });

  describe('createPlan', () => {
    it('should create a plan through iterative tool calls', async () => {
      // Mock LLM responses for plan creation
      mockOllamaService.chat
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              { function: { name: 'create_plan', arguments: { query: 'test', name: 'Test Plan' } } },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              { function: { name: 'add_phase', arguments: { name: 'search', replanCheckpoint: true } } },
            ],
          },
        })
        .mockResolvedValueOnce({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              { function: { name: 'finalize_plan', arguments: {} } },
            ],
          },
        });

      const plan = await service.createPlan('test query', 'log-123');

      expect(plan).toBeDefined();
      expect(plan.query).toBe('test');
      expect(plan.phases.length).toBe(1);
      expect(plan.phases[0].name).toBe('search');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=planner.service.spec.ts`
Expected: FAIL

**Step 3: Implement PlannerService**

```typescript
// src/orchestration/planner.service.ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OllamaService } from '../llm/ollama.service';
import { ToolExecutor } from '../executors/tool.executor';
import { LogService } from '../logging/log.service';
import { Plan } from './interfaces/plan.interface';
import { Phase, PhaseResult } from './interfaces/phase.interface';
import { PlanStep } from './interfaces/plan-step.interface';
import { FailureContext, RecoveryDecision } from './interfaces/recovery.interface';
import { ChatMessage } from '../llm/interfaces/chat-message.interface';
import { planningTools } from './tools/planning-tools';
import { recoveryTools } from './tools/recovery-tools';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';

@Injectable()
export class PlannerService {
  private currentPlan: Plan | null = null;
  private phaseResults: Map<string, any> = new Map();

  constructor(
    private llmService: OllamaService,
    private toolExecutor: ToolExecutor,
    private logService: LogService,
  ) {}

  async createPlan(query: string, logId: string): Promise<Plan> {
    this.currentPlan = null;
    this.phaseResults.clear();

    const availableTools = this.toolExecutor.getAvailableTools();
    const systemPrompt = this.buildPlannerSystemPrompt(availableTools);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildPlanningPrompt(query) },
    ];

    let planningComplete = false;
    const maxIterations = 20;
    let iteration = 0;

    while (!planningComplete && iteration < maxIterations) {
      iteration++;

      const response = await this.llmService.chat(messages, planningTools);

      if (response.message.tool_calls?.length > 0) {
        for (const toolCall of response.message.tool_calls) {
          const result = await this.executePlanningTool(toolCall, logId);

          if (toolCall.function.name === 'finalize_plan') {
            planningComplete = true;
          }

          messages.push(response.message);
          messages.push({ role: 'tool', content: JSON.stringify(result) });
        }
      } else {
        messages.push(response.message);
        messages.push({
          role: 'user',
          content: 'Continue building the plan or call finalize_plan when complete.',
        });
      }
    }

    if (!this.currentPlan) {
      throw new Error('Planning failed: no plan created');
    }

    this.currentPlan.status = 'executing';
    return this.currentPlan;
  }

  async replan(
    plan: Plan,
    completedPhase: Phase,
    phaseResult: PhaseResult,
    logId: string,
    failureInfo?: { message: string; code?: string; stack?: string },
  ): Promise<{ modified: boolean; plan: Plan }> {
    this.currentPlan = plan;

    await this.logService.append({
      logId,
      eventType: 'replan_triggered',
      timestamp: new Date(),
      planId: plan.id,
      phaseId: completedPhase.id,
      data: {
        reason: failureInfo ? 'failure' : 'checkpoint',
        phaseName: completedPhase.name,
      },
    });

    const context = this.buildReplanContext(plan, completedPhase, phaseResult, failureInfo);

    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildReplannerSystemPrompt() },
      { role: 'user', content: context },
    ];

    const response = await this.llmService.chat(messages, planningTools);

    let modified = false;

    if (response.message.tool_calls?.length > 0) {
      for (const toolCall of response.message.tool_calls) {
        const modifyingTools = ['add_step', 'remove_step', 'modify_step', 'skip_phase', 'insert_phase_after', 'add_phase'];
        if (modifyingTools.includes(toolCall.function.name)) {
          modified = true;
        }
        await this.executePlanningTool(toolCall, logId);
      }
    }

    await this.logService.append({
      logId,
      eventType: 'replan_completed',
      timestamp: new Date(),
      planId: plan.id,
      data: { modified },
    });

    return { modified, plan: this.currentPlan! };
  }

  async decideRecovery(context: FailureContext, logId: string): Promise<RecoveryDecision> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildRecoverySystemPrompt() },
      { role: 'user', content: this.buildRecoveryPrompt(context) },
    ];

    const response = await this.llmService.chat(messages, recoveryTools);

    if (response.message.tool_calls?.length > 0) {
      const toolCall = response.message.tool_calls[0];
      const args = toolCall.function.arguments;

      switch (toolCall.function.name) {
        case 'retry_step':
          return {
            action: 'retry',
            reason: args.reason,
            modifications: args.modifiedConfig ? { retryWithConfig: args.modifiedConfig } : undefined,
          };
        case 'skip_step':
          return { action: 'skip', reason: args.reason };
        case 'replace_step':
          return {
            action: 'alternative',
            reason: args.reason,
            modifications: {
              alternativeSteps: [{
                id: randomUUID(),
                phaseId: context.failedStep?.stepId?.split('-')[0] || '',
                type: 'tool_call',
                toolName: args.alternativeToolName,
                config: args.alternativeConfig,
                dependencies: [],
                status: 'pending',
                order: 0,
              }],
            },
          };
        case 'abort_plan':
          return { action: 'abort', reason: args.reason };
      }
    }

    return { action: 'abort', reason: 'No recovery decision made by planner' };
  }

  setPhaseResults(phaseId: string, results: any): void {
    this.phaseResults.set(phaseId, results);
  }

  private async executePlanningTool(toolCall: any, logId: string): Promise<any> {
    const { name, arguments: args } = toolCall.function;
    let result: any;

    switch (name) {
      case 'create_plan':
        this.currentPlan = {
          id: randomUUID(),
          query: args.query,
          status: 'planning',
          phases: [],
          createdAt: new Date(),
        };
        result = { planId: this.currentPlan.id, status: 'created' };
        break;

      case 'add_phase': {
        const phase: Phase = {
          id: randomUUID(),
          planId: this.currentPlan!.id,
          name: args.name,
          description: args.description,
          status: 'pending',
          steps: [],
          replanCheckpoint: args.replanCheckpoint ?? false,
          order: this.currentPlan!.phases.length,
        };
        this.currentPlan!.phases.push(phase);
        result = { phaseId: phase.id, status: 'added' };

        await this.logService.append({
          logId,
          eventType: 'phase_added',
          timestamp: new Date(),
          planId: this.currentPlan!.id,
          phaseId: phase.id,
          data: { name: phase.name, replanCheckpoint: phase.replanCheckpoint, description: phase.description },
        });
        break;
      }

      case 'add_step': {
        const targetPhase = this.currentPlan!.phases.find((p) => p.id === args.phaseId);
        if (!targetPhase) {
          result = { error: `Phase ${args.phaseId} not found` };
          break;
        }

        const step: PlanStep = {
          id: randomUUID(),
          phaseId: args.phaseId,
          type: args.type,
          toolName: args.toolName,
          config: args.config,
          dependencies: args.dependsOn ?? [],
          status: 'pending',
          order: targetPhase.steps.length,
        };
        targetPhase.steps.push(step);
        result = { stepId: step.id, status: 'added' };

        await this.logService.append({
          logId,
          eventType: 'step_added',
          timestamp: new Date(),
          planId: this.currentPlan!.id,
          phaseId: args.phaseId,
          stepId: step.id,
          data: { toolName: args.toolName, type: args.type, config: args.config },
        });
        break;
      }

      case 'modify_step': {
        const step = this.findStep(args.stepId);
        if (step) {
          Object.assign(step, args.changes);
          result = { stepId: args.stepId, status: 'modified' };

          await this.logService.append({
            logId,
            eventType: 'step_modified',
            timestamp: new Date(),
            planId: this.currentPlan!.id,
            stepId: args.stepId,
            data: { changes: args.changes },
          });
        } else {
          result = { error: `Step ${args.stepId} not found` };
        }
        break;
      }

      case 'remove_step': {
        const removed = this.removeStep(args.stepId);
        result = { stepId: args.stepId, status: removed ? 'removed' : 'not_found' };

        if (removed) {
          await this.logService.append({
            logId,
            eventType: 'step_removed',
            timestamp: new Date(),
            planId: this.currentPlan!.id,
            stepId: args.stepId,
            data: { reason: args.reason },
          });
        }
        break;
      }

      case 'skip_phase': {
        const phase = this.currentPlan!.phases.find((p) => p.id === args.phaseId);
        if (phase) {
          phase.status = 'skipped';
          result = { phaseId: args.phaseId, status: 'skipped' };
        } else {
          result = { error: `Phase ${args.phaseId} not found` };
        }
        break;
      }

      case 'insert_phase_after': {
        const afterIndex = this.currentPlan!.phases.findIndex((p) => p.id === args.afterPhaseId);
        if (afterIndex >= 0) {
          const newPhase: Phase = {
            id: randomUUID(),
            planId: this.currentPlan!.id,
            name: args.name,
            description: args.description,
            status: 'pending',
            steps: [],
            replanCheckpoint: args.replanCheckpoint ?? false,
            order: afterIndex + 1,
          };
          this.currentPlan!.phases.splice(afterIndex + 1, 0, newPhase);
          // Reorder subsequent phases
          for (let i = afterIndex + 2; i < this.currentPlan!.phases.length; i++) {
            this.currentPlan!.phases[i].order = i;
          }
          result = { phaseId: newPhase.id, status: 'inserted' };

          await this.logService.append({
            logId,
            eventType: 'phase_added',
            timestamp: new Date(),
            planId: this.currentPlan!.id,
            phaseId: newPhase.id,
            data: { name: newPhase.name, insertedAfter: args.afterPhaseId },
          });
        } else {
          result = { error: `Phase ${args.afterPhaseId} not found` };
        }
        break;
      }

      case 'get_plan_status':
        result = this.getPlanSummary();
        break;

      case 'get_phase_results':
        result = this.phaseResults.get(args.phaseId) || { error: 'No results for phase' };
        break;

      case 'finalize_plan':
        result = {
          status: 'finalized',
          totalPhases: this.currentPlan!.phases.length,
          totalSteps: this.currentPlan!.phases.reduce((sum, p) => sum + p.steps.length, 0),
        };
        break;

      default:
        result = { error: `Unknown planning tool: ${name}` };
    }

    return result;
  }

  private findStep(stepId: string): PlanStep | undefined {
    for (const phase of this.currentPlan!.phases) {
      const step = phase.steps.find((s) => s.id === stepId);
      if (step) return step;
    }
    return undefined;
  }

  private removeStep(stepId: string): boolean {
    for (const phase of this.currentPlan!.phases) {
      const index = phase.steps.findIndex((s) => s.id === stepId);
      if (index >= 0) {
        phase.steps.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  private getPlanSummary(): any {
    if (!this.currentPlan) return { error: 'No plan created' };

    return {
      planId: this.currentPlan.id,
      query: this.currentPlan.query,
      status: this.currentPlan.status,
      phases: this.currentPlan.phases.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        stepCount: p.steps.length,
        replanCheckpoint: p.replanCheckpoint,
      })),
    };
  }

  private buildPlannerSystemPrompt(availableTools: ToolDefinition[]): string {
    const toolList = availableTools
      .map((t) => `- ${t.function.name}: ${t.function.description}`)
      .join('\n');

    return `You are a research planning agent. Your job is to analyze a user's research query and create a detailed execution plan.

## Available Execution Tools
${toolList}

## Planning Process
1. Call create_plan to initialize the plan
2. Call add_phase for each major phase (e.g., search, fetch, synthesize)
3. Call add_step to add atomic operations within each phase
4. Set replanCheckpoint=true on phases where results might change the approach
5. Call finalize_plan when the plan is complete

## Guidelines
- Create atomic, granular steps. Each step should do ONE thing.
- Consider dependencies between steps - use dependsOn when a step needs prior results.
- For search tasks, create multiple search steps with different queries for thorough coverage.
- For fetch tasks, plan to fetch from multiple sources.
- Always include a synthesis phase at the end to combine results.`;
  }

  private buildPlanningPrompt(query: string): string {
    return `Create an execution plan for the following research query:

"${query}"

Start by calling create_plan, then add phases and steps. Call finalize_plan when done.`;
  }

  private buildReplannerSystemPrompt(): string {
    return `You are reviewing a research plan at a checkpoint. Based on the results so far, decide if the plan needs modification.

You can:
- add_step: Add new steps to gather more information
- remove_step: Remove steps that are no longer needed
- modify_step: Change step configuration
- skip_phase: Skip remaining phases if we have enough information
- add_phase: Add a new phase if needed

If the plan is good as-is, don't make any changes.`;
  }

  private buildReplanContext(
    plan: Plan,
    completedPhase: Phase,
    phaseResult: PhaseResult,
    failureInfo?: { message: string; code?: string; stack?: string },
  ): string {
    const summary = this.getPlanSummary();
    const resultsSummary = phaseResult.stepResults.map((r) => ({
      stepId: r.stepId,
      status: r.status,
      hasOutput: !!r.output,
    }));

    return `## Plan Summary
${JSON.stringify(summary, null, 2)}

## Completed Phase
Name: ${completedPhase.name}
Status: ${phaseResult.status}

## Phase Results
${JSON.stringify(resultsSummary, null, 2)}

${failureInfo ? `## Failure Info\n${JSON.stringify(failureInfo, null, 2)}` : ''}

## Remaining Phases
${plan.phases.filter((p) => p.status === 'pending').map((p) => p.name).join(', ')}

Review the results and decide if the plan needs modification.`;
  }

  private buildRecoverySystemPrompt(): string {
    return `You are handling a failure in a research plan. Decide the best recovery action:

- retry_step: Try again, optionally with modified parameters
- skip_step: Skip this step if the plan can succeed without it
- replace_step: Use a different tool/approach
- abort_plan: Give up if recovery is impossible

Choose the most appropriate action based on the failure context.`;
  }

  private buildRecoveryPrompt(context: FailureContext): string {
    return `## Plan Summary
${context.planSummary}

## Failure Details
- Phase: ${context.failedPhase}
- Step: ${context.failedStep?.toolName || 'unknown'}
- Config: ${JSON.stringify(context.failedStep?.config)}
- Error: ${context.failedStep?.error?.message}

## Completed Steps
${context.completedSteps.join(', ') || 'None'}

## Remaining Phases
${context.remainingPhases.join(', ') || 'None'}

Choose the best recovery action.`;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=planner.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/orchestration/planner.service.ts src/orchestration/planner.service.spec.ts
git commit -m "feat(orchestration): add planner service with tool-based planning"
```

---

## Phase 6: Orchestrator

### Task 14: Orchestrator Service

**Files:**
- Create: `src/orchestration/orchestrator.service.ts`
- Create: `src/orchestration/orchestrator.service.spec.ts`

**Step 1: Write failing test**

```typescript
// src/orchestration/orchestrator.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Orchestrator } from './orchestrator.service';
import { PlannerService } from './planner.service';
import { ExecutorRegistry } from '../executors/executor-registry.service';
import { LogService } from '../logging/log.service';
import { Plan } from './interfaces/plan.interface';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let mockPlannerService: any;
  let mockExecutorRegistry: any;
  let mockLogService: any;
  let mockEventEmitter: any;

  const mockPlan: Plan = {
    id: 'plan-1',
    query: 'test query',
    status: 'executing',
    phases: [
      {
        id: 'phase-1',
        planId: 'plan-1',
        name: 'search',
        status: 'pending',
        steps: [
          {
            id: 'step-1',
            phaseId: 'phase-1',
            type: 'tool_call',
            toolName: 'tavily_search',
            config: { query: 'test' },
            dependencies: [],
            status: 'pending',
            order: 0,
          },
        ],
        replanCheckpoint: false,
        order: 0,
      },
    ],
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockPlannerService = {
      createPlan: jest.fn().mockResolvedValue(mockPlan),
      replan: jest.fn().mockResolvedValue({ modified: false, plan: mockPlan }),
      decideRecovery: jest.fn().mockResolvedValue({ action: 'skip', reason: 'test' }),
      setPhaseResults: jest.fn(),
    };

    const mockExecutor = {
      execute: jest.fn().mockResolvedValue({ output: { results: ['test'] } }),
    };

    mockExecutorRegistry = {
      getExecutor: jest.fn().mockReturnValue(mockExecutor),
    };

    mockLogService = {
      append: jest.fn().mockResolvedValue({ id: 'log-1' }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Orchestrator,
        { provide: PlannerService, useValue: mockPlannerService },
        { provide: ExecutorRegistry, useValue: mockExecutorRegistry },
        { provide: LogService, useValue: mockLogService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    orchestrator = module.get<Orchestrator>(Orchestrator);
  });

  describe('executeResearch', () => {
    it('should create plan and execute all phases', async () => {
      const result = await orchestrator.executeResearch('test query');

      expect(mockPlannerService.createPlan).toHaveBeenCalledWith('test query', expect.any(String));
      expect(mockExecutorRegistry.getExecutor).toHaveBeenCalledWith('tool_call');
      expect(result).toBeDefined();
      expect(result.logId).toBeDefined();
    });

    it('should emit session events', async () => {
      await orchestrator.executeResearch('test query');

      expect(mockLogService.append).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'session_started' }),
      );
      expect(mockLogService.append).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'session_completed' }),
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=orchestrator.service.spec.ts`
Expected: FAIL

**Step 3: Implement Orchestrator**

```typescript
// src/orchestration/orchestrator.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PlannerService } from './planner.service';
import { ExecutorRegistry } from '../executors/executor-registry.service';
import { LogService } from '../logging/log.service';
import { Plan } from './interfaces/plan.interface';
import { Phase, PhaseResult, StepResult } from './interfaces/phase.interface';
import { PlanStep } from './interfaces/plan-step.interface';
import { LogEventType } from '../logging/interfaces/log-event-type.enum';
import { FailureContext, RecoveryDecision } from './interfaces/recovery.interface';

export interface ResearchResult {
  logId: string;
  planId: string;
  answer: string;
  sources: Array<{ url: string; title: string; relevance: string }>;
  metadata: {
    totalExecutionTime: number;
    phases: Array<{ phase: string; executionTime: number }>;
  };
}

@Injectable()
export class Orchestrator {
  constructor(
    private plannerService: PlannerService,
    private executorRegistry: ExecutorRegistry,
    private logService: LogService,
    private eventEmitter: EventEmitter2,
  ) {}

  async executeResearch(query: string): Promise<ResearchResult> {
    const logId = randomUUID();
    const startTime = Date.now();
    const phaseMetrics: Array<{ phase: string; executionTime: number }> = [];

    // 1. PLANNING PHASE
    await this.emit(logId, 'session_started', { query });

    const plan = await this.plannerService.createPlan(query, logId);

    await this.emit(logId, 'plan_created', {
      planId: plan.id,
      totalPhases: plan.phases.length,
      phases: plan.phases.map((p) => p.name),
    });

    let finalOutput = '';
    const sources: Array<{ url: string; title: string; relevance: string }> = [];

    // 2. EXECUTION LOOP
    for (const phase of plan.phases) {
      if (phase.status === 'skipped') continue;

      const phaseStartTime = Date.now();
      const phaseResult = await this.executePhase(phase, plan, logId);

      phaseMetrics.push({
        phase: phase.name,
        executionTime: Date.now() - phaseStartTime,
      });

      // Store phase results for potential re-planning
      this.plannerService.setPhaseResults(phase.id, phaseResult);

      // Extract sources and final output
      this.extractResultData(phaseResult, sources, (output) => {
        finalOutput = output;
      });

      // 3. RE-PLAN CHECKPOINT
      if (phase.replanCheckpoint && phaseResult.status === 'completed') {
        const { modified } = await this.plannerService.replan(
          plan,
          phase,
          phaseResult,
          logId,
        );
        if (modified) {
          // Plan was modified - continue with updated phases
        }
      }

      // 4. FAILURE HANDLING
      if (phaseResult.status === 'failed') {
        const recovery = await this.handleFailure(plan, phase, phaseResult, logId);
        if (recovery.action === 'abort') {
          await this.emit(logId, 'session_failed', { reason: recovery.reason });
          throw new Error(`Research failed: ${recovery.reason}`);
        }
      }
    }

    // 5. COMPLETION
    const totalExecutionTime = Date.now() - startTime;

    await this.emit(logId, 'session_completed', {
      planId: plan.id,
      totalExecutionTime,
      phaseCount: plan.phases.length,
    });

    return {
      logId,
      planId: plan.id,
      answer: finalOutput,
      sources,
      metadata: {
        totalExecutionTime,
        phases: phaseMetrics,
      },
    };
  }

  private async executePhase(phase: Phase, plan: Plan, logId: string): Promise<PhaseResult> {
    phase.status = 'running';

    await this.emit(logId, 'phase_started', {
      phaseId: phase.id,
      phaseName: phase.name,
      stepCount: phase.steps.length,
    }, phase.id);

    const stepResults: StepResult[] = [];
    const stepQueue = this.buildExecutionQueue(phase.steps);

    for (const stepBatch of stepQueue) {
      const batchResults = await Promise.all(
        stepBatch.map((step) => this.executeStep(step, logId)),
      );
      stepResults.push(...batchResults);

      const failed = batchResults.find((r) => r.status === 'failed');
      if (failed) {
        phase.status = 'failed';
        await this.emit(logId, 'phase_failed', {
          phaseId: phase.id,
          phaseName: phase.name,
          failedStepId: failed.stepId,
          error: failed.error?.message,
        }, phase.id);
        return { status: 'failed', stepResults, error: failed.error };
      }
    }

    phase.status = 'completed';
    await this.emit(logId, 'phase_completed', {
      phaseId: phase.id,
      phaseName: phase.name,
      stepsCompleted: stepResults.length,
    }, phase.id);

    return { status: 'completed', stepResults };
  }

  private async executeStep(step: PlanStep, logId: string): Promise<StepResult> {
    const startTime = Date.now();
    step.status = 'running';

    await this.emit(logId, 'step_started', {
      stepId: step.id,
      toolName: step.toolName,
      type: step.type,
      config: step.config,
    }, undefined, step.id);

    try {
      const executor = this.executorRegistry.getExecutor(step.type);
      const result = await executor.execute(step);
      const durationMs = Date.now() - startTime;

      step.status = 'completed';

      await this.emit(logId, 'step_completed', {
        stepId: step.id,
        toolName: step.toolName,
        input: step.config,
        output: result.output,
        tokensUsed: result.tokensUsed,
        durationMs,
        metadata: result.metadata,
      }, undefined, step.id);

      return { status: 'completed', stepId: step.id, output: result.output, input: step.config };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      step.status = 'failed';

      await this.emit(logId, 'step_failed', {
        stepId: step.id,
        toolName: step.toolName,
        input: step.config,
        error: {
          message: error.message,
          stack: error.stack,
        },
        durationMs,
      }, undefined, step.id);

      return { status: 'failed', stepId: step.id, error, input: step.config };
    }
  }

  private buildExecutionQueue(steps: PlanStep[]): PlanStep[][] {
    const queue: PlanStep[][] = [];
    const completed = new Set<string>();
    const remaining = [...steps];

    while (remaining.length > 0) {
      const batch: PlanStep[] = [];

      for (let i = remaining.length - 1; i >= 0; i--) {
        const step = remaining[i];
        const depsComplete = step.dependencies.every((dep) => completed.has(dep));

        if (depsComplete) {
          batch.push(step);
          remaining.splice(i, 1);
        }
      }

      if (batch.length === 0 && remaining.length > 0) {
        // Circular dependency or missing dependency - execute remaining in order
        batch.push(...remaining);
        remaining.length = 0;
      }

      if (batch.length > 0) {
        queue.push(batch);
        batch.forEach((s) => completed.add(s.id));
      }
    }

    return queue;
  }

  private async handleFailure(
    plan: Plan,
    phase: Phase,
    phaseResult: PhaseResult,
    logId: string,
  ): Promise<RecoveryDecision> {
    const failedStep = phaseResult.stepResults.find((r) => r.status === 'failed');

    const failureContext: FailureContext = {
      planSummary: JSON.stringify({
        planId: plan.id,
        query: plan.query,
        phases: plan.phases.map((p) => ({ name: p.name, status: p.status })),
      }),
      failedPhase: phase.name,
      failedStep: failedStep
        ? {
            stepId: failedStep.stepId,
            toolName: phase.steps.find((s) => s.id === failedStep.stepId)?.toolName || 'unknown',
            config: failedStep.input,
            error: {
              message: failedStep.error?.message || 'Unknown error',
              stack: failedStep.error?.stack,
            },
          }
        : undefined,
      completedSteps: phaseResult.stepResults
        .filter((r) => r.status === 'completed')
        .map((r) => r.stepId),
      remainingPhases: plan.phases.filter((p) => p.status === 'pending').map((p) => p.name),
    };

    return this.plannerService.decideRecovery(failureContext, logId);
  }

  private extractResultData(
    phaseResult: PhaseResult,
    sources: Array<{ url: string; title: string; relevance: string }>,
    setOutput: (output: string) => void,
  ): void {
    for (const stepResult of phaseResult.stepResults) {
      if (stepResult.output) {
        // Extract sources from search results
        if (Array.isArray(stepResult.output)) {
          for (const item of stepResult.output) {
            if (item.url && item.title) {
              sources.push({
                url: item.url,
                title: item.title,
                relevance: item.score > 0.7 ? 'high' : 'medium',
              });
            }
          }
        }
        // Extract final answer from synthesis step
        if (typeof stepResult.output === 'string' && stepResult.output.length > 100) {
          setOutput(stepResult.output);
        }
      }
    }
  }

  private async emit(
    logId: string,
    eventType: LogEventType,
    data: any,
    phaseId?: string,
    stepId?: string,
  ): Promise<void> {
    const entry = await this.logService.append({
      logId,
      eventType,
      timestamp: new Date(),
      phaseId,
      stepId,
      data,
    });

    this.eventEmitter.emit(`log.${logId}`, entry);
    this.eventEmitter.emit('log.all', entry);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern=orchestrator.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/orchestration/orchestrator.service.ts src/orchestration/orchestrator.service.spec.ts
git commit -m "feat(orchestration): add orchestrator service with phase execution and recovery"
```

---

### Task 15: Orchestration Module

**Files:**
- Create: `src/orchestration/orchestration.module.ts`

**Step 1: Create orchestration module**

```typescript
// src/orchestration/orchestration.module.ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Orchestrator } from './orchestrator.service';
import { PlannerService } from './planner.service';
import { ExecutorsModule } from '../executors/executors.module';
import { LoggingModule } from '../logging/logging.module';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ExecutorsModule,
    LoggingModule,
    LLMModule,
  ],
  providers: [Orchestrator, PlannerService],
  exports: [Orchestrator, PlannerService],
})
export class OrchestrationModule {}
```

**Step 2: Commit**

```bash
git add src/orchestration/orchestration.module.ts
git commit -m "feat(orchestration): add orchestration module"
```

---

## Phase 7: Module Integration

### Task 16: Update Logging Module

**Files:**
- Modify: `src/logging/logging.module.ts`

**Step 1: Read current logging module**

Run: `cat src/logging/logging.module.ts` (or check if it exists)

**Step 2: Create/update logging module**

```typescript
// src/logging/logging.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LogService } from './log.service';
import { LogEntryEntity } from './entities/log-entry.entity';
import { ResearchLogger } from './research-logger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LogEntryEntity]),
    EventEmitterModule.forRoot(),
  ],
  providers: [LogService, ResearchLogger],
  exports: [LogService, ResearchLogger],
})
export class LoggingModule {}
```

**Step 3: Commit**

```bash
git add src/logging/logging.module.ts
git commit -m "feat(logging): update logging module with new LogService"
```

---

### Task 17: Update Research Service

**Files:**
- Modify: `src/research/research.service.ts`

**Step 1: Update research service to use orchestrator**

```typescript
// src/research/research.service.ts
import { Injectable } from '@nestjs/common';
import { Orchestrator, ResearchResult } from '../orchestration/orchestrator.service';

@Injectable()
export class ResearchService {
  constructor(private orchestrator: Orchestrator) {}

  async executeResearch(query: string): Promise<ResearchResult> {
    return this.orchestrator.executeResearch(query);
  }
}
```

**Step 2: Commit**

```bash
git add src/research/research.service.ts
git commit -m "refactor(research): delegate to orchestrator"
```

---

### Task 18: Update Research Module

**Files:**
- Modify: `src/research/research.module.ts`

**Step 1: Update research module imports**

```typescript
// src/research/research.module.ts
import { Module } from '@nestjs/common';
import { ResearchService } from './research.service';
import { ResearchController } from './research.controller';
import { ResearchStreamController } from './research-stream.controller';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { LoggingModule } from '../logging/logging.module';

@Module({
  imports: [OrchestrationModule, LoggingModule],
  controllers: [ResearchController, ResearchStreamController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}
```

**Step 2: Commit**

```bash
git add src/research/research.module.ts
git commit -m "refactor(research): update module to use orchestration"
```

---

### Task 19: Update Stream Controller

**Files:**
- Modify: `src/research/research-stream.controller.ts`

**Step 1: Update stream controller for new log format**

```typescript
// src/research/research-stream.controller.ts
import { Controller, Param, Sse } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, Subscriber } from 'rxjs';
import { LogService } from '../logging/log.service';
import { LogEntry } from '../logging/interfaces/log-entry.interface';

interface UIEvent {
  id: string;
  logId: string;
  eventType: string;
  timestamp: string;
  planId?: string;
  phaseId?: string;
  stepId?: string;
  title?: string;
  description?: string;
  status?: string;
  durationMs?: number;
  tokensUsed?: { prompt: number; completion: number; total: number };
  toolName?: string;
  outputPreview?: string;
  error?: string;
  phaseName?: string;
  [key: string]: any;
}

@Controller('research')
export class ResearchStreamController {
  constructor(
    private eventEmitter: EventEmitter2,
    private logService: LogService,
  ) {}

  @Sse('stream/:logId')
  streamSession(@Param('logId') logId: string): Observable<MessageEvent> {
    return new Observable((subscriber: Subscriber<MessageEvent>) => {
      this.sendExistingLogs(logId, subscriber);

      const listener = (entry: LogEntry) => {
        subscriber.next({
          data: JSON.stringify(this.transformToUIEvent(entry)),
          type: entry.eventType,
          id: entry.id,
        } as MessageEvent);
      };

      this.eventEmitter.on(`log.${logId}`, listener);

      return () => {
        this.eventEmitter.off(`log.${logId}`, listener);
      };
    });
  }

  private async sendExistingLogs(logId: string, subscriber: Subscriber<MessageEvent>): Promise<void> {
    const existingLogs = await this.logService.getSessionLogs(logId);

    for (const entry of existingLogs) {
      subscriber.next({
        data: JSON.stringify(this.transformToUIEvent(entry)),
        type: entry.eventType,
        id: entry.id,
      } as MessageEvent);
    }
  }

  private transformToUIEvent(entry: LogEntry): UIEvent {
    return {
      id: entry.id,
      logId: entry.logId,
      eventType: entry.eventType,
      timestamp: entry.timestamp.toISOString(),
      planId: entry.planId,
      phaseId: entry.phaseId,
      stepId: entry.stepId,
      ...this.extractUIData(entry),
    };
  }

  private extractUIData(entry: LogEntry): Partial<UIEvent> {
    switch (entry.eventType) {
      case 'session_started':
        return {
          title: 'Session Started',
          description: `Query: ${entry.data.query}`,
          status: 'running',
        };

      case 'plan_created':
        return {
          title: 'Plan Created',
          description: `${entry.data.totalPhases} phases planned`,
          totalPhases: entry.data.totalPhases,
        };

      case 'phase_added':
        return {
          title: `Phase: ${entry.data.name}`,
          phaseName: entry.data.name,
          description: entry.data.description,
          hasCheckpoint: entry.data.replanCheckpoint,
        };

      case 'step_added':
        return {
          title: `Step: ${entry.data.toolName}`,
          toolName: entry.data.toolName,
          description: JSON.stringify(entry.data.config),
        };

      case 'phase_started':
        return {
          title: `Starting: ${entry.data.phaseName}`,
          phaseName: entry.data.phaseName,
          status: 'running',
          stepCount: entry.data.stepCount,
        };

      case 'phase_completed':
        return {
          title: `Completed: ${entry.data.phaseName}`,
          phaseName: entry.data.phaseName,
          status: 'completed',
          stepsCompleted: entry.data.stepsCompleted,
        };

      case 'phase_failed':
        return {
          title: `Failed: ${entry.data.phaseName}`,
          phaseName: entry.data.phaseName,
          status: 'error',
          error: entry.data.error,
        };

      case 'step_started':
        return {
          title: `Executing: ${entry.data.toolName}`,
          toolName: entry.data.toolName,
          status: 'running',
        };

      case 'step_completed':
        return {
          title: `Completed: ${entry.data.toolName}`,
          toolName: entry.data.toolName,
          status: 'completed',
          durationMs: entry.data.durationMs,
          tokensUsed: entry.data.tokensUsed,
          outputPreview: this.truncate(JSON.stringify(entry.data.output), 200),
        };

      case 'step_failed':
        return {
          title: `Failed: ${entry.data.toolName}`,
          toolName: entry.data.toolName,
          status: 'error',
          error: entry.data.error?.message,
          durationMs: entry.data.durationMs,
        };

      case 'replan_triggered':
        return {
          title: 'Re-planning',
          description: `Reason: ${entry.data.reason}`,
          status: 'running',
        };

      case 'replan_completed':
        return {
          title: 'Re-planning Complete',
          description: entry.data.modified ? 'Plan was modified' : 'No changes',
        };

      case 'session_completed':
        return {
          title: 'Research Complete',
          status: 'completed',
          totalExecutionTime: entry.data.totalExecutionTime,
        };

      case 'session_failed':
        return {
          title: 'Research Failed',
          status: 'error',
          error: entry.data.reason,
        };

      default:
        return { title: entry.eventType };
    }
  }

  private truncate(str: string, maxLen: number): string {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  }
}
```

**Step 2: Commit**

```bash
git add src/research/research-stream.controller.ts
git commit -m "refactor(research): update stream controller for new log format"
```

---

## Phase 8: Database Migration

### Task 20: Create Database Migration

**Files:**
- Create: `src/migrations/[timestamp]-AddLogEntriesTable.ts`

**Step 1: Generate migration**

Run: `npm run typeorm migration:create src/migrations/AddLogEntriesTable`

**Step 2: Implement migration**

```typescript
// src/migrations/[timestamp]-AddLogEntriesTable.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLogEntriesTable[timestamp] implements MigrationInterface {
  name = 'AddLogEntriesTable[timestamp]';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "log_entries" (
        "id" uuid NOT NULL,
        "logId" uuid NOT NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "eventType" varchar(50) NOT NULL,
        "planId" uuid,
        "phaseId" uuid,
        "stepId" uuid,
        "data" jsonb NOT NULL,
        CONSTRAINT "PK_log_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_log_entries_logId" ON "log_entries" ("logId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_log_entries_timestamp" ON "log_entries" ("timestamp")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_log_entries_eventType" ON "log_entries" ("eventType")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_log_entries_data" ON "log_entries" USING GIN ("data")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_log_entries_data"`);
    await queryRunner.query(`DROP INDEX "IDX_log_entries_eventType"`);
    await queryRunner.query(`DROP INDEX "IDX_log_entries_timestamp"`);
    await queryRunner.query(`DROP INDEX "IDX_log_entries_logId"`);
    await queryRunner.query(`DROP TABLE "log_entries"`);
  }
}
```

**Step 3: Commit**

```bash
git add src/migrations/
git commit -m "feat(db): add log_entries table migration"
```

---

## Phase 9: Final Integration

### Task 21: Update App Module

**Files:**
- Modify: `src/app.module.ts`

**Step 1: Ensure all modules are imported**

Add OrchestrationModule and update LoggingModule imports in app.module.ts.

**Step 2: Commit**

```bash
git add src/app.module.ts
git commit -m "feat(app): integrate orchestration module"
```

---

### Task 22: Run All Tests

**Step 1: Run test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete agentic planning system implementation"
```

---

## Summary

This implementation plan creates a complete agentic planning system with:

1. **Core Interfaces** (Tasks 1-4): Plan, Phase, Step, Executor, Log structures
2. **Logging Infrastructure** (Tasks 5-6): Immutable log service with query capabilities
3. **Executors** (Tasks 7-10): Registry, Tool executor, LLM executor
4. **Planning Tools** (Tasks 11-12): Tool definitions for plan construction and recovery
5. **Planner Service** (Task 13): LLM-driven plan creation and re-planning
6. **Orchestrator** (Tasks 14-15): Phase execution with dependency handling
7. **Module Integration** (Tasks 16-19): Wire everything together
8. **Database Migration** (Task 20): Persistent log storage
9. **Final Integration** (Tasks 21-22): App-level integration and testing

Total: 22 tasks, approximately 3-4 hours of implementation time.
