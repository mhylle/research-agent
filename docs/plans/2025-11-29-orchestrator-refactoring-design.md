# Orchestrator Refactoring Design

**Date:** 2025-11-29
**Status:** Approved
**Author:** Design collaboration with user

## Overview

Refactor the orchestrator service to follow Single Responsibility Principle and Service Delegation pattern. The current orchestrator (1039 lines) violates SRP by handling too many concerns. This refactoring extracts specialized services and introduces phase-specific executors.

## Problem Statement

**Current Issues:**
- Testing difficulties - hard to test individual pieces, lots of mocking required
- Change ripple effects - small changes require touching the entire orchestrator
- Code navigation - finding the right code is difficult, methods too long
- Reusability - can't reuse logic (like evaluation coordination) in other contexts
- Maintainability - 1039 lines with 10+ distinct responsibilities

## Solution: Hybrid Service Delegation + Phase Strategy Pattern

**Approach:**
- Extract services for cross-cutting concerns (Approach 1)
- Use strategy pattern for phase-specific execution logic (Approach 2)
- Phase executors compose services to do their work

**Benefits:**
- Clear separation of concerns
- Testable components (services and executors independently testable)
- High reusability (services can be used elsewhere)
- Gradual migration possible
- Aligns with NestJS dependency injection patterns
- Reduced orchestrator size (~250 lines)

## Architecture

### Service Layer (Cross-Cutting Concerns)

#### 1. EventCoordinatorService
**Responsibilities:** All event emission and logging

**Key Methods:**
```typescript
async emit(logId, eventType, data, phaseId?, stepId?): Promise<void>
async emitPhaseStarted(logId, phase): Promise<void>
async emitPhaseCompleted(logId, phase, stepCount): Promise<void>
async emitPhaseFailed(logId, phase, error): Promise<void>
```

**Implementation:**
- Wraps LogService and EventEmitter2
- All logs go through this service → database + real-time events
- Provides convenience methods for common events

#### 2. MilestoneService
**Responsibilities:** Milestone detection, template data building, milestone emission

**Key Methods:**
```typescript
async emitMilestonesForPhase(phase, logId, query): Promise<void>
async emitPhaseCompletion(phase, logId): Promise<void>
private detectPhaseType(phaseName): 1 | 2 | 3 | null
private buildMilestoneTemplateData(...): Record<string, unknown>
private extractKeyTerms(query): string[]
```

**Implementation:**
- Uses EventCoordinatorService for emission
- Contains all milestone-related logic from orchestrator
- Handles phase type detection and template data building

#### 3. ResultExtractorService
**Responsibilities:** Extract sources, outputs, retrieval content, search queries from results

**Key Methods:**
```typescript
extractSources(stepResults): Source[]
extractFinalOutput(stepResults): string
collectRetrievalContent(stepResults): RetrievalContent[]
extractSearchQueries(plan): string[]
```

**Implementation:**
- Pure data transformation functions
- No external dependencies
- Prioritizes synthesis step outputs over generic string outputs

#### 4. EvaluationCoordinatorService
**Responsibilities:** Orchestrates all three evaluation phases, handles evaluation record persistence

**Key Methods:**
```typescript
async evaluatePlan(logId, plan, searchQueries): Promise<PlanEvaluationResult>
async evaluateRetrieval(logId, query, stepResults): Promise<RetrievalEvaluationResult>
async evaluateAnswer(logId, query, answer, sources): Promise<AnswerEvaluationResult>
```

**Implementation:**
- Delegates to PlanEvaluationOrchestratorService, RetrievalEvaluatorService, AnswerEvaluatorService
- Emits evaluation events via EventCoordinatorService
- Saves/updates evaluation records via EvaluationService

#### 5. StepConfigurationService
**Responsibilities:** Provides default configurations, enriches synthesis steps with context

**Key Methods:**
```typescript
getDefaultConfig(toolName, plan?, phaseResults?): Record<string, unknown>
enrichSynthesizeStep(step, plan, accumulatedResults): void
private buildSynthesisContext(results): string
```

**Implementation:**
- Tool-specific default configurations
- Context building from accumulated results for synthesis steps
- No external dependencies

### Phase Executor Layer (Phase-Specific Logic)

#### IPhaseExecutor Interface
```typescript
export interface PhaseExecutionContext {
  logId: string;
  plan: Plan;
  allPreviousResults: StepResult[];
}

export interface IPhaseExecutor {
  canHandle(phase: Phase): boolean;
  execute(phase: Phase, context: PhaseExecutionContext): Promise<PhaseResult>;
}
```

#### BasePhaseExecutor (Abstract Base Class)
**Provides:**
- Default step execution logic (queue building, parallel execution, error handling)
- Common phase lifecycle (start → milestones → execute → complete)
- Template method pattern - subclasses can override specific parts

**Key Methods:**
```typescript
abstract canHandle(phase: Phase): boolean
async execute(phase, context): Promise<PhaseResult>
protected async executeSteps(phase, context): Promise<StepResult[]>
protected async executeStep(step, context, phaseResults): Promise<StepResult>
protected buildExecutionQueue(steps): PlanStep[][]
protected hasFailedSteps(results): boolean
protected handleFailure(...): Promise<PhaseResult>
```

**Dependencies:**
- EventCoordinatorService
- MilestoneService
- ExecutorRegistry
- StepConfigurationService

#### Concrete Phase Executors

##### SearchPhaseExecutor
**Handles:** Phases with 'search', 'query', 'initial' in name

**Special Behavior:**
- Triggers retrieval evaluation after successful execution if retrieval content exists

##### FetchPhaseExecutor
**Handles:** Phases with 'fetch', 'gather', 'content' in name

**Special Behavior:**
- Triggers retrieval evaluation after successful execution

##### SynthesisPhaseExecutor
**Handles:** Phases with 'synth', 'answer', 'generat' in name

**Special Behavior:**
- Uses default execute() from base class
- Synthesis steps are enriched by StepConfigurationService

##### GenericPhaseExecutor
**Handles:** Any phase not matched by specific executors (fallback)

**Special Behavior:**
- Uses all default behavior from base class

### Refactored Orchestrator

**Size:** ~250 lines (down from 1039)

**Responsibilities:**
1. High-level research flow orchestration
2. Delegates to services for cross-cutting concerns
3. Delegates to phase executors for phase execution
4. Manages re-planning and failure handling

**Key Changes:**
- No direct event emission (uses EventCoordinatorService)
- No milestone management (uses MilestoneService)
- No result extraction (uses ResultExtractorService)
- No evaluation orchestration (uses EvaluationCoordinatorService)
- No step configuration (uses StepConfigurationService)
- No phase execution (uses phase executors)

**Simplified Flow:**
```typescript
async executeResearch(query, logId?): Promise<ResearchResult> {
  // 1. Planning
  await eventCoordinator.emit(logId, 'session_started', { query });
  const plan = await plannerService.createPlan(query, logId);

  // 2. Plan evaluation
  const searchQueries = resultExtractor.extractSearchQueries(plan);
  await evaluationCoordinator.evaluatePlan(logId, plan, searchQueries);

  // 3. Execution loop
  for (const phase of plan.phases) {
    const executor = this.getPhaseExecutor(phase);
    const result = await executor.execute(phase, context);

    // Extract results
    sources.push(...resultExtractor.extractSources([result]));
    finalOutput = resultExtractor.extractFinalOutput([result]) || finalOutput;

    // Handle re-planning and failures
    if (phase.replanCheckpoint) await handleReplan(...);
    if (result.status === 'failed') await handlePhaseFailure(...);
  }

  // 4. Answer evaluation
  await evaluationCoordinator.evaluateAnswer(logId, plan.query, finalOutput, sources);

  // 5. Completion
  await eventCoordinator.emit(logId, 'session_completed', {...});
  return { logId, planId, answer, sources, metadata };
}
```

## Logging Strategy

### Principles
1. **All logs are user-facing** - Everything goes to database
2. **Single source of truth** - All logs through EventCoordinator
3. **Structured logging** - Consistent format for querying
4. **Correlation** - All logs include logId, phaseId, stepId where applicable

### Implementation
- **ALL logs** go through `EventCoordinator.emit()`
- `EventCoordinator.emit()` → `LogService.append()` → database
- `EventCoordinator.emit()` → `EventEmitter.emit()` → real-time events
- No parallel logging via NestJS Logger for user-facing logs

### New Event Types
```typescript
export enum LogEventType {
  // Existing events (unchanged)
  'session_started' = 'session_started',
  'session_completed' = 'session_completed',
  'plan_created' = 'plan_created',
  'phase_started' = 'phase_started',
  'phase_completed' = 'phase_completed',
  'step_started' = 'step_started',
  'step_completed' = 'step_completed',
  // ... existing events

  // New service-level events
  'service_method_started' = 'service_method_started',
  'service_method_completed' = 'service_method_completed',
  'service_method_failed' = 'service_method_failed',

  // New LLM-specific events
  'llm_call_started' = 'llm_call_started',
  'llm_call_completed' = 'llm_call_completed',
  'llm_call_failed' = 'llm_call_failed',
}
```

### Service Method Logging Example
```typescript
async evaluatePlan(logId, plan, searchQueries): Promise<PlanEvaluationResult> {
  // Log method start
  await this.eventCoordinator.emit(logId, 'service_method_started', {
    service: 'EvaluationCoordinatorService',
    method: 'evaluatePlan',
    input: { planId, query, phaseCount, searchQueries },
  });

  // ... execute method ...

  // Log method completion
  await this.eventCoordinator.emit(logId, 'service_method_completed', {
    service: 'EvaluationCoordinatorService',
    method: 'evaluatePlan',
    output: { passed, scores, confidence },
  });
}
```

### LLM Call Logging Example
```typescript
async execute(step, logId): Promise<ExecutionResult> {
  await this.eventCoordinator.emit(logId, 'llm_call_started', {
    stepId: step.id,
    model: this.modelName,
    prompt: prompt,
    config: step.config,
  }, step.phaseId, step.id);

  const response = await this.llmClient.generate(prompt);

  await this.eventCoordinator.emit(logId, 'llm_call_completed', {
    stepId: step.id,
    model: this.modelName,
    prompt: prompt,
    response: response.text,
    tokensUsed: response.tokensUsed,
    durationMs,
  }, step.phaseId, step.id);
}
```

## File Structure

```
src/orchestration/
├── orchestrator.service.ts                    # Refactored (250 lines)
├── orchestrator.module.ts                     # Updated with new providers
├── planner.service.ts                         # Unchanged
│
├── services/                                  # NEW - Extracted services
│   ├── event-coordinator.service.ts           # Event emission & logging
│   ├── milestone.service.ts                   # Milestone management
│   ├── result-extractor.service.ts            # Result extraction
│   ├── evaluation-coordinator.service.ts      # Evaluation orchestration
│   └── step-configuration.service.ts          # Step config & enrichment
│
├── phase-executors/                           # NEW - Phase strategies
│   ├── interfaces/
│   │   ├── phase-executor.interface.ts        # IPhaseExecutor
│   │   └── phase-execution-context.ts         # PhaseExecutionContext
│   ├── base-phase-executor.ts                 # Abstract base class
│   ├── search-phase-executor.ts               # Search phase logic
│   ├── fetch-phase-executor.ts                # Fetch phase logic
│   ├── synthesis-phase-executor.ts            # Synthesis phase logic
│   └── generic-phase-executor.ts              # Fallback executor
│
├── interfaces/                                # Existing interfaces
│   ├── plan.interface.ts
│   ├── phase.interface.ts
│   ├── plan-step.interface.ts
│   └── recovery.interface.ts
│
└── tests/                                     # NEW - Comprehensive tests
    ├── services/
    │   ├── event-coordinator.service.spec.ts
    │   ├── milestone.service.spec.ts
    │   ├── result-extractor.service.spec.ts
    │   ├── evaluation-coordinator.service.spec.ts
    │   └── step-configuration.service.spec.ts
    ├── phase-executors/
    │   ├── base-phase-executor.spec.ts
    │   ├── search-phase-executor.spec.ts
    │   ├── fetch-phase-executor.spec.ts
    │   ├── synthesis-phase-executor.spec.ts
    │   └── generic-phase-executor.spec.ts
    └── orchestrator.service.spec.ts           # Updated integration tests
```

## Migration Strategy

### Phase 1: Extract Services (Low Risk)

**Order:**
1. EventCoordinatorService - Simplest, no business logic
2. MilestoneService - Self-contained, no external dependencies
3. ResultExtractorService - Pure data transformation
4. StepConfigurationService - Isolated logic
5. EvaluationCoordinatorService - Most complex, do last

**For each service:**
1. Create new service file
2. Move methods from orchestrator to service
3. Add service to orchestrator.module.ts providers
4. Inject service into orchestrator
5. Update orchestrator to call service methods
6. Write unit tests for service
7. Run integration tests
8. Commit

### Phase 2: Create Phase Executors (Medium Risk)

**Order:**
1. Create interfaces (IPhaseExecutor, PhaseExecutionContext)
2. Create BasePhaseExecutor - Extract common logic from orchestrator
3. Create GenericPhaseExecutor - Simplest, just extends base
4. Create specific executors (Search → Fetch → Synthesis)
5. Update orchestrator to use executor pattern
6. Remove old executePhase logic

**Test Strategy:**
- Test each executor independently with mocked services
- Test orchestrator integration to ensure correct executor selection
- Run full integration test suite

### Phase 3: Update Event Types & Logging (Low Risk)

1. Add new event types to LogEventType enum
2. Update services to use new event types
3. Update frontend to handle new event types (optional - backward compatible)
4. No breaking changes - just additional events

### Phase 4: Cleanup (Final)

1. Remove unused code from orchestrator
2. Update all tests
3. Run full integration test suite
4. Performance testing
5. Documentation updates

## NestJS Module Configuration

```typescript
@Module({
  imports: [
    LogModule,
    ExecutorsModule,
    EvaluationModule,
  ],
  providers: [
    // Main orchestrator
    Orchestrator,
    PlannerService,

    // Services
    EventCoordinatorService,
    MilestoneService,
    ResultExtractorService,
    EvaluationCoordinatorService,
    StepConfigurationService,

    // Phase executors
    SearchPhaseExecutor,
    FetchPhaseExecutor,
    SynthesisPhaseExecutor,
    GenericPhaseExecutor,
  ],
  exports: [Orchestrator],
})
export class OrchestrationModule {}
```

## Testing Strategy

### Unit Tests
- Test each service in isolation
- Test each phase executor with mocked services
- Mock EventCoordinator, services, and executors

### Integration Tests
- Test orchestrator with real services but mocked external dependencies
- Test full research flow end-to-end
- Test error handling and recovery scenarios

### Test Coverage Goals
- Services: 90%+ coverage
- Phase executors: 85%+ coverage
- Orchestrator: 80%+ coverage (integration-focused)

## Benefits

**Before:**
- 1039 lines in one file
- 10+ distinct responsibilities
- Hard to test (requires mocking entire world)
- High coupling (changes ripple everywhere)
- Low reusability (logic embedded in orchestrator)

**After:**
- 250 lines in orchestrator
- Single responsibility: high-level flow coordination
- Easy to test (mock simple interfaces)
- Low coupling (services and executors isolated)
- High reusability (services can be used independently)
- Clear separation of concerns
- Extensible (easy to add new phase executors)

## Risks & Mitigation

**Risk: Breaking existing functionality**
- Mitigation: Incremental migration, comprehensive testing at each step

**Risk: Performance overhead from additional abstraction**
- Mitigation: Performance testing, ensure no unnecessary async/await chains

**Risk: Increased complexity from more files**
- Mitigation: Clear naming conventions, comprehensive documentation, organized folder structure

## Success Criteria

1. ✅ Orchestrator reduced to ~250 lines
2. ✅ All services independently testable
3. ✅ All tests passing (unit + integration)
4. ✅ No functional regressions
5. ✅ All logs continue to flow to database
6. ✅ No performance degradation
7. ✅ Code easier to navigate and understand

## Next Steps

1. Create git worktree for isolated development
2. Generate detailed implementation plan
3. Begin Phase 1: Extract EventCoordinatorService
