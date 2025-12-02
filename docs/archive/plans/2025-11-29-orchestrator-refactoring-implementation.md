# Orchestrator Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, OR use superpowers:subagent-driven-development for subagent-per-task execution with code review between tasks.

**Goal:** Refactor the orchestrator service from 1039 lines to ~250 lines by extracting specialized services and implementing phase-specific executors using the Service Delegation + Phase Strategy Pattern.

**Architecture:** Extract 5 cross-cutting services (EventCoordinator, Milestone, ResultExtractor, EvaluationCoordinator, StepConfiguration) and implement 4 phase executors (Search, Fetch, Synthesis, Generic) with a shared base class. All services use dependency injection. All logs flow through EventCoordinator to database.

**Tech Stack:** NestJS, TypeScript, Jest

**Execution Strategy:** Each major task (Phase 1 services, Phase 2 executors, Phase 3 orchestrator) should be delegated to a subagent for parallel/independent execution. Use Task tool with subagent_type='general-purpose' for each phase.

---

## Phase 1: Extract Services

### Task 1.1: EventCoordinatorService

**Files:**
- Create: `src/orchestration/services/event-coordinator.service.ts`
- Create: `src/orchestration/services/event-coordinator.service.spec.ts`
- Modify: `src/orchestration/orchestrator.service.ts` (will inject and use service)
- Modify: `src/orchestration/orchestrator.module.ts` (add to providers)

**Step 1: Create service interface and basic structure**

Create `src/orchestration/services/event-coordinator.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LogService } from '../../logging/log.service';
import { LogEventType } from '../../logging/interfaces/log-event-type.enum';
import { Phase } from '../interfaces/phase.interface';

@Injectable()
export class EventCoordinatorService {
  constructor(
    private readonly logService: LogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async emit(
    logId: string,
    eventType: LogEventType,
    data: Record<string, unknown>,
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

  async emitPhaseStarted(
    logId: string,
    phase: Phase,
    reason?: string,
  ): Promise<void> {
    await this.emit(
      logId,
      'phase_started',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepCount: phase.steps.length,
        ...(reason && { reason }),
      },
      phase.id,
    );
  }

  async emitPhaseCompleted(
    logId: string,
    phase: Phase,
    stepsCompleted: number,
    reason?: string,
  ): Promise<void> {
    await this.emit(
      logId,
      'phase_completed',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepsCompleted,
        ...(reason && { reason }),
      },
      phase.id,
    );
  }

  async emitPhaseFailed(
    logId: string,
    phase: Phase,
    failedStepId: string,
    error: string,
  ): Promise<void> {
    await this.emit(
      logId,
      'phase_failed',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        failedStepId,
        error,
      },
      phase.id,
    );
  }
}
```

**Step 2: Write tests for EventCoordinatorService**

Create `src/orchestration/services/event-coordinator.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventCoordinatorService } from './event-coordinator.service';
import { LogService } from '../../logging/log.service';
import { Phase } from '../interfaces/phase.interface';

describe('EventCoordinatorService', () => {
  let service: EventCoordinatorService;
  let logService: jest.Mocked<LogService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventCoordinatorService,
        {
          provide: LogService,
          useValue: {
            append: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventCoordinatorService>(EventCoordinatorService);
    logService = module.get(LogService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('emit', () => {
    it('should append to log service and emit events', async () => {
      const mockEntry = { id: '1', logId: 'log1', eventType: 'test_event' };
      logService.append.mockResolvedValue(mockEntry as any);

      await service.emit('log1', 'test_event' as any, { test: 'data' });

      expect(logService.append).toHaveBeenCalledWith({
        logId: 'log1',
        eventType: 'test_event',
        timestamp: expect.any(Date),
        phaseId: undefined,
        stepId: undefined,
        data: { test: 'data' },
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('log.log1', mockEntry);
      expect(eventEmitter.emit).toHaveBeenCalledWith('log.all', mockEntry);
    });
  });

  describe('emitPhaseStarted', () => {
    it('should emit phase_started event with correct data', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Test Phase',
        steps: [{} as any, {} as any],
      } as Phase;

      logService.append.mockResolvedValue({} as any);

      await service.emitPhaseStarted('log1', phase);

      expect(logService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'phase_started',
          phaseId: 'phase1',
          data: expect.objectContaining({
            phaseId: 'phase1',
            phaseName: 'Test Phase',
            stepCount: 2,
          }),
        }),
      );
    });

    it('should include reason if provided', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Test Phase',
        steps: [],
      } as Phase;

      logService.append.mockResolvedValue({} as any);

      await service.emitPhaseStarted('log1', phase, 'replan_added_steps');

      expect(logService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: 'replan_added_steps',
          }),
        }),
      );
    });
  });
});
```

**Step 3: Run tests to verify they pass**

Run: `npm test -- event-coordinator.service.spec.ts`
Expected: PASS (all tests green)

**Step 4: Add service to module providers**

Modify `src/orchestration/orchestrator.module.ts`:

```typescript
import { EventCoordinatorService } from './services/event-coordinator.service';

@Module({
  imports: [
    LogModule,
    ExecutorsModule,
    EvaluationModule,
  ],
  providers: [
    Orchestrator,
    PlannerService,
    EventCoordinatorService, // ADD THIS
  ],
  exports: [Orchestrator],
})
export class OrchestrationModule {}
```

**Step 5: Update Orchestrator to use EventCoordinatorService**

Modify `src/orchestration/orchestrator.service.ts`:

1. Add import:
```typescript
import { EventCoordinatorService } from './services/event-coordinator.service';
```

2. Inject in constructor:
```typescript
constructor(
  private plannerService: PlannerService,
  private executorRegistry: ExecutorRegistry,
  private logService: LogService,
  private eventEmitter: EventEmitter2,
  private eventCoordinator: EventCoordinatorService, // ADD THIS
  // ... other dependencies
) {}
```

3. Replace all `this.emit()` calls with `this.eventCoordinator.emit()`:
   - Keep the private `emit()` method for now (will remove later)
   - Search for `await this.emit(` and replace with `await this.eventCoordinator.emit(`
   - Use convenience methods where applicable:
     - `this.eventCoordinator.emitPhaseStarted()` for phase_started events
     - `this.eventCoordinator.emitPhaseCompleted()` for phase_completed events
     - `this.eventCoordinator.emitPhaseFailed()` for phase_failed events

**Step 6: Run integration tests**

Run: `npm test -- orchestrator.service.spec.ts`
Expected: Same baseline (6 failures from pre-existing issues)

**Step 7: Commit EventCoordinatorService**

```bash
git add src/orchestration/services/event-coordinator.service.ts
git add src/orchestration/services/event-coordinator.service.spec.ts
git add src/orchestration/orchestrator.module.ts
git add src/orchestration/orchestrator.service.ts
git commit -m "feat: extract EventCoordinatorService from orchestrator

- Create EventCoordinatorService with emit and convenience methods
- Add comprehensive unit tests
- Integrate into orchestrator (parallel to existing emit method)
- All logs continue to flow through LogService to database"
```

---

### Task 1.2: MilestoneService

**Files:**
- Create: `src/orchestration/services/milestone.service.ts`
- Create: `src/orchestration/services/milestone.service.spec.ts`
- Modify: `src/orchestration/orchestrator.service.ts` (remove milestone methods)
- Modify: `src/orchestration/orchestrator.module.ts` (add to providers)

**Step 1: Create MilestoneService**

Create `src/orchestration/services/milestone.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { EventCoordinatorService } from './event-coordinator.service';
import { Phase } from '../interfaces/phase.interface';
import {
  getMilestoneTemplates,
  formatMilestoneDescription,
} from '../../logging/milestone-templates';

@Injectable()
export class MilestoneService {
  constructor(private readonly eventCoordinator: EventCoordinatorService) {}

  async emitMilestonesForPhase(
    phase: Phase,
    logId: string,
    query: string,
  ): Promise<void> {
    const stageType = this.detectPhaseType(phase.name);
    if (!stageType) {
      console.log(
        `[MilestoneService] Phase "${phase.name}" does not map to a milestone stage`,
      );
      return;
    }

    const templates = getMilestoneTemplates(stageType);
    console.log(
      `[MilestoneService] Emitting ${templates.length} milestones for stage ${stageType} (${phase.name})`,
    );

    // Emit initial milestones for the phase
    for (let i = 0; i < templates.length - 1; i++) {
      const template = templates[i];
      const milestoneId = `${phase.id}_${template.id}`;

      const templateData = this.buildMilestoneTemplateData(
        stageType,
        template.id,
        query,
        phase,
      );
      const description = formatMilestoneDescription(
        template.template,
        templateData,
      );

      await this.eventCoordinator.emit(
        logId,
        'milestone_started',
        {
          milestoneId,
          templateId: template.id,
          stage: stageType,
          description,
          template: template.template,
          templateData,
          progress: template.expectedProgress,
          status: 'running',
        },
        phase.id,
      );

      await this.delay(100);
    }
  }

  async emitPhaseCompletion(phase: Phase, logId: string): Promise<void> {
    const stageType = this.detectPhaseType(phase.name);
    if (!stageType) return;

    const templates = getMilestoneTemplates(stageType);
    if (templates.length === 0) return;

    const lastTemplate = templates[templates.length - 1];
    const milestoneId = `${phase.id}_${lastTemplate.id}`;
    const description = formatMilestoneDescription(lastTemplate.template, {});

    await this.eventCoordinator.emit(
      logId,
      'milestone_completed',
      {
        milestoneId,
        templateId: lastTemplate.id,
        stage: stageType,
        description,
        template: lastTemplate.template,
        templateData: {},
        progress: lastTemplate.expectedProgress,
        status: 'completed',
      },
      phase.id,
    );
  }

  private detectPhaseType(phaseName: string): 1 | 2 | 3 | null {
    const name = phaseName.toLowerCase();
    if (
      name.includes('search') ||
      name.includes('initial') ||
      name.includes('query')
    ) {
      return 1;
    }
    if (
      name.includes('fetch') ||
      name.includes('content') ||
      name.includes('gather')
    ) {
      return 2;
    }
    if (
      name.includes('synth') ||
      name.includes('answer') ||
      name.includes('generat')
    ) {
      return 3;
    }
    return null;
  }

  private buildMilestoneTemplateData(
    stage: 1 | 2 | 3,
    templateId: string,
    query: string,
    phase: Phase,
  ): Record<string, unknown> {
    switch (stage) {
      case 1:
        if (templateId === 'stage1_identify_terms') {
          const terms = this.extractKeyTerms(query);
          return { terms: terms.join(', ') };
        }
        if (templateId === 'stage1_search') {
          return {
            count: phase.steps.length,
            sources: 'Tavily (web sources, news, articles)',
          };
        }
        return {};

      case 2:
        if (templateId === 'stage2_fetch') {
          return { count: phase.steps.length };
        }
        if (templateId === 'stage2_extract') {
          return { url: 'source content' };
        }
        return {};

      case 3:
        if (templateId === 'stage3_analyze') {
          return { count: phase.steps.length };
        }
        return {};

      default:
        return {};
    }
  }

  private extractKeyTerms(query: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'been',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'can',
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'this',
      'that',
      'these',
      'those',
      'latest',
      'current',
      'recent',
      'about',
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    const uniqueWords = [...new Set(words)];
    return uniqueWords.sort((a, b) => b.length - a.length).slice(0, 5);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

**Step 2: Write tests for MilestoneService**

Create `src/orchestration/services/milestone.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MilestoneService } from './milestone.service';
import { EventCoordinatorService } from './event-coordinator.service';
import { Phase } from '../interfaces/phase.interface';

describe('MilestoneService', () => {
  let service: MilestoneService;
  let eventCoordinator: jest.Mocked<EventCoordinatorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MilestoneService,
        {
          provide: EventCoordinatorService,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MilestoneService>(MilestoneService);
    eventCoordinator = module.get(EventCoordinatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('emitMilestonesForPhase', () => {
    it('should emit milestones for search phase', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      expect(eventCoordinator.emit).toHaveBeenCalled();
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'log1',
        'milestone_started',
        expect.objectContaining({
          stage: 1,
          status: 'running',
        }),
        'phase1',
      );
    });

    it('should not emit milestones for unknown phase type', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Unknown Phase',
        steps: [],
      } as Phase;

      await service.emitMilestonesForPhase(phase, 'log1', 'test query');

      expect(eventCoordinator.emit).not.toHaveBeenCalled();
    });
  });

  describe('emitPhaseCompletion', () => {
    it('should emit completion milestone', async () => {
      const phase: Phase = {
        id: 'phase1',
        name: 'Search Phase',
        steps: [],
      } as Phase;

      await service.emitPhaseCompletion(phase, 'log1');

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        'log1',
        'milestone_completed',
        expect.objectContaining({
          stage: 1,
          status: 'completed',
        }),
        'phase1',
      );
    });
  });
});
```

**Step 3: Run tests**

Run: `npm test -- milestone.service.spec.ts`
Expected: PASS

**Step 4: Add to module and integrate with orchestrator**

1. Add to `orchestrator.module.ts` providers
2. Inject into orchestrator constructor
3. Replace `this.emitPhaseMilestones()` with `this.milestoneService.emitMilestonesForPhase()`
4. Replace `this.emitPhaseCompletionMilestone()` with `this.milestoneService.emitPhaseCompletion()`

**Step 5: Run integration tests**

Run: `npm test -- orchestrator.service.spec.ts`
Expected: Same baseline

**Step 6: Commit**

```bash
git add src/orchestration/services/milestone.service.ts
git add src/orchestration/services/milestone.service.spec.ts
git add src/orchestration/orchestrator.module.ts
git add src/orchestration/orchestrator.service.ts
git commit -m "feat: extract MilestoneService from orchestrator

- Create MilestoneService with phase detection and emission logic
- Add comprehensive unit tests
- Integrate into orchestrator
- Remove milestone methods from orchestrator"
```

---

### Task 1.3: ResultExtractorService

**Files:**
- Create: `src/orchestration/services/result-extractor.service.ts`
- Create: `src/orchestration/services/result-extractor.service.spec.ts`

**Step 1: Create ResultExtractorService**

Create `src/orchestration/services/result-extractor.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PhaseResult, StepResult } from '../interfaces/phase.interface';
import { Plan } from '../interfaces/plan.interface';

export interface Source {
  url: string;
  title: string;
  relevance: string;
}

export interface RetrievalContent {
  url: string;
  content: string;
  title?: string;
  fetchedAt?: Date;
}

@Injectable()
export class ResultExtractorService {
  extractSources(phaseResults: PhaseResult[]): Source[] {
    const sources: Source[] = [];

    for (const phaseResult of phaseResults) {
      for (const stepResult of phaseResult.stepResults) {
        if (stepResult.output && Array.isArray(stepResult.output)) {
          for (const item of stepResult.output) {
            if (this.isSearchResultItem(item)) {
              const score = typeof item.score === 'number' ? item.score : 0;
              sources.push({
                url: item.url,
                title: item.title,
                relevance: score > 0.7 ? 'high' : 'medium',
              });
            }
          }
        }
      }
    }

    return sources;
  }

  extractFinalOutput(phaseResults: PhaseResult[]): string {
    let synthesisOutput: string | null = null;
    let genericStringOutput: string | null = null;

    for (const phaseResult of phaseResults) {
      for (const stepResult of phaseResult.stepResults) {
        if (
          stepResult.output &&
          typeof stepResult.output === 'string' &&
          stepResult.output.trim().length > 0
        ) {
          const isSynthesisStep =
            stepResult.toolName &&
            (stepResult.toolName.toLowerCase().includes('synth') ||
              stepResult.toolName === 'llm');

          if (isSynthesisStep) {
            synthesisOutput = stepResult.output;
          } else if (!synthesisOutput && stepResult.output.length > 50) {
            genericStringOutput = stepResult.output;
          }
        }
      }
    }

    return synthesisOutput || genericStringOutput || '';
  }

  collectRetrievalContent(stepResults: StepResult[]): RetrievalContent[] {
    const retrievalContent: RetrievalContent[] = [];

    for (const stepResult of stepResults) {
      if (stepResult.status === 'completed' && stepResult.output) {
        if (Array.isArray(stepResult.output)) {
          for (const item of stepResult.output) {
            if (this.isSearchResultItem(item)) {
              retrievalContent.push({
                url: item.url,
                title: item.title,
                content: item.content || '',
                fetchedAt: new Date(),
              });
            }
          }
        } else if (
          typeof stepResult.output === 'string' &&
          stepResult.output.length > 50
        ) {
          retrievalContent.push({
            url: `fetched-content-${retrievalContent.length}`,
            content: stepResult.output,
            title: 'Fetched Content',
            fetchedAt: new Date(),
          });
        }
      }
    }

    return retrievalContent;
  }

  extractSearchQueries(plan: Plan): string[] {
    const queries: string[] = [];
    for (const phase of plan.phases) {
      for (const step of phase.steps) {
        if (
          (step.toolName === 'web_search' || step.toolName === 'tavily_search') &&
          step.config?.query
        ) {
          queries.push(step.config.query as string);
        }
      }
    }
    return queries;
  }

  private isSearchResultItem(
    item: unknown,
  ): item is { url: string; title: string; content: string; score?: number } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'url' in item &&
      'title' in item &&
      'content' in item &&
      typeof (item as Record<string, unknown>).url === 'string' &&
      typeof (item as Record<string, unknown>).title === 'string' &&
      typeof (item as Record<string, unknown>).content === 'string'
    );
  }
}
```

**Step 2: Write tests**

Create `src/orchestration/services/result-extractor.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ResultExtractorService } from './result-extractor.service';
import { PhaseResult, StepResult } from '../interfaces/phase.interface';
import { Plan } from '../interfaces/plan.interface';

describe('ResultExtractorService', () => {
  let service: ResultExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResultExtractorService],
    }).compile();

    service = module.get<ResultExtractorService>(ResultExtractorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractSources', () => {
    it('should extract sources from search results', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'tavily_search',
              output: [
                {
                  url: 'https://example.com',
                  title: 'Example',
                  content: 'Content',
                  score: 0.8,
                },
              ],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toEqual({
        url: 'https://example.com',
        title: 'Example',
        relevance: 'high',
      });
    });

    it('should return medium relevance for low scores', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'tavily_search',
              output: [
                {
                  url: 'https://example.com',
                  title: 'Example',
                  content: 'Content',
                  score: 0.5,
                },
              ],
            },
          ],
        },
      ];

      const sources = service.extractSources(phaseResults);

      expect(sources[0].relevance).toBe('medium');
    });
  });

  describe('extractFinalOutput', () => {
    it('should prioritize synthesis step output', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'web_fetch',
              output: 'Generic long output that is more than 50 characters long',
            },
            {
              status: 'completed',
              stepId: 'step2',
              toolName: 'synthesize',
              output: 'Synthesis output',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe('Synthesis output');
    });

    it('should fall back to generic string output if no synthesis', () => {
      const phaseResults: PhaseResult[] = [
        {
          status: 'completed',
          stepResults: [
            {
              status: 'completed',
              stepId: 'step1',
              toolName: 'web_fetch',
              output: 'Generic long output that is more than 50 characters long',
            },
          ],
        },
      ];

      const output = service.extractFinalOutput(phaseResults);

      expect(output).toBe(
        'Generic long output that is more than 50 characters long',
      );
    });
  });

  describe('extractSearchQueries', () => {
    it('should extract queries from plan steps', () => {
      const plan: Plan = {
        id: 'plan1',
        query: 'test',
        phases: [
          {
            id: 'phase1',
            name: 'Search',
            steps: [
              {
                id: 'step1',
                toolName: 'tavily_search',
                config: { query: 'query 1' },
              } as any,
              {
                id: 'step2',
                toolName: 'web_search',
                config: { query: 'query 2' },
              } as any,
            ],
          } as any,
        ],
      } as Plan;

      const queries = service.extractSearchQueries(plan);

      expect(queries).toEqual(['query 1', 'query 2']);
    });
  });
});
```

**Step 3: Run tests**

Run: `npm test -- result-extractor.service.spec.ts`
Expected: PASS

**Step 4: Integrate and commit**

Add to module, inject into orchestrator, replace extraction logic, commit.

---

### Task 1.4: StepConfigurationService

**Files:**
- Create: `src/orchestration/services/step-configuration.service.ts`
- Create: `src/orchestration/services/step-configuration.service.spec.ts`

**Implementation:** Follow same pattern as above - create service, tests, integrate, commit.

---

### Task 1.5: EvaluationCoordinatorService

**Files:**
- Create: `src/orchestration/services/evaluation-coordinator.service.ts`
- Create: `src/orchestration/services/evaluation-coordinator.service.spec.ts`

**Implementation:** This is the most complex service - coordinates plan, retrieval, and answer evaluation. Follow TDD approach, write comprehensive tests.

---

## Phase 2: Create Phase Executors

**Delegate to Subagent:** Use Task tool to delegate this entire phase to a subagent specialized in implementation.

### Task 2.1: Create Phase Executor Interfaces

**Files:**
- Create: `src/orchestration/phase-executors/interfaces/phase-executor.interface.ts`
- Create: `src/orchestration/phase-executors/interfaces/phase-execution-context.ts`

### Task 2.2: Create BasePhaseExecutor

**Files:**
- Create: `src/orchestration/phase-executors/base-phase-executor.ts`
- Create: `src/orchestration/phase-executors/base-phase-executor.spec.ts`

### Task 2.3-2.6: Create Concrete Executors

Create Search, Fetch, Synthesis, and Generic executors with tests.

---

## Phase 3: Refactor Orchestrator

**Delegate to Subagent:** Use Task tool to delegate final orchestrator simplification.

### Task 3.1: Integrate Phase Executors into Orchestrator

**Files:**
- Modify: `src/orchestration/orchestrator.service.ts`
- Modify: `src/orchestration/orchestrator.module.ts`

### Task 3.2: Remove Extracted Logic from Orchestrator

Remove all private methods that have been moved to services.

### Task 3.3: Update Orchestrator Tests

Rewrite tests to match new structure.

### Task 3.4: Verify End-to-End

Run full test suite and verify all functionality preserved.

---

## Phase 4: Add New Event Types

### Task 4.1: Update LogEventType Enum

**Files:**
- Modify: `src/logging/interfaces/log-event-type.enum.ts`

Add new event types for service methods and LLM calls.

### Task 4.2: Update Services to Emit New Events

Add service-level logging to all service methods.

---

## Success Criteria

- ✅ All tests passing (fixing 6 pre-existing failures)
- ✅ Orchestrator reduced to ~250 lines
- ✅ 5 services created with >85% test coverage
- ✅ 4 phase executors created with >85% test coverage
- ✅ All functionality preserved
- ✅ All logs flowing through EventCoordinator
- ✅ No performance degradation

---

## Execution Notes

- **Use subagents for each major phase** - Delegate Phase 1 (services), Phase 2 (executors), and Phase 3 (orchestrator) to separate subagents
- **Each task is atomic** - Can be completed, tested, and committed independently
- **Follow TDD** - Write tests first, watch them fail, implement, watch them pass
- **Frequent commits** - Commit after each task completion
- **Run tests frequently** - After every code change
- **Keep baseline** - Ensure we don't introduce new test failures
