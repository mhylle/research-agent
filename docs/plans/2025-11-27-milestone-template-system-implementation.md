# Milestone Template System Implementation Plan

**Date:** 2025-11-27
**Status:** Draft
**Purpose:** Complete the milestone template system wiring to enable granular progress feedback in the UI

## Executive Summary

The milestone template system is **~70% implemented**. Core infrastructure exists but events aren't flowing to the frontend. This plan focuses on **wiring the existing components together**.

## Current State Analysis

### What Already Exists

| Component | Location | Status |
|-----------|----------|--------|
| Milestone Templates | `src/logging/milestone-templates.ts` | Complete |
| `formatMilestoneDescription()` | `src/logging/milestone-templates.ts` | Complete |
| `MilestoneEvent` interface | `src/logging/interfaces/enhanced-log-entry.interface.ts` | Complete |
| `logMilestone()` method | `src/logging/research-logger.service.ts:265-316` | Complete |
| Pipeline milestone emission | `src/research/pipeline-executor.service.ts` | Complete |
| Frontend `MilestoneEventData` | `client/src/app/models/activity-task.model.ts` | Partial |

### What's Missing (The Gaps)

| Gap | Impact |
|-----|--------|
| `'milestone'` not in `LogEventType` enum | Type safety issues |
| Milestones bypass `LogService.append()` | Events don't reach SSE stream |
| No `extractUIData` case for milestones | Events not transformed for UI |
| No frontend `'milestone'` event listener | Frontend doesn't receive milestones |
| No milestone state tracking | Can't display milestone progress |
| No milestone UI components | Users don't see milestones |

### Current Event Flow (Broken)

```
Pipeline Executor
  ↓
ResearchLogger.logMilestone()
  ↓
EventEmitter.emit('event:${logId}')  ← WRONG channel
  ✗
SSE Controller listens to 'log.${logId}' ← DIFFERENT channel
  ✗
Frontend never receives milestone events
```

### Target Event Flow (Fixed)

```
Pipeline Executor
  ↓
ResearchLogger.logMilestone()
  ↓
LogService.append({ eventType: 'milestone', ... })
  ↓
EventEmitter.emit('log.${logId}')  ← CORRECT channel
  ↓
SSE Controller transforms to UIEvent
  ↓
Frontend 'milestone' event listener
  ↓
AgentActivityService updates milestone state
  ↓
UI displays milestone with formatted template
```

---

## Implementation Tasks

### Phase 1: Backend Event Routing (3 tasks)

#### Task 1.1: Add milestone to LogEventType enum

**File:** `src/logging/interfaces/log-event-type.enum.ts`

Add milestone-related event types:
```typescript
// Add to existing enum
'milestone_started' | 'milestone_progress' | 'milestone_completed'
```

**Acceptance:** TypeScript compilation passes with new event types

---

#### Task 1.2: Route milestones through LogService

**File:** `src/logging/research-logger.service.ts`

Modify `logMilestone()` to also call `LogService.append()`:

```typescript
async logMilestone(
  logId: string,
  nodeId: string,
  milestoneId: string,
  stage: 1 | 2 | 3,
  template: string,
  data: Record<string, any>,
  progress: number,
  status: 'pending' | 'running' | 'completed' | 'error' = 'running'
): Promise<void> {
  const formattedDescription = formatMilestoneDescription(template, data);

  // Existing Winston logging (keep)
  this.logger.info(`Milestone: ${formattedDescription}`, { ... });

  // NEW: Route through LogService for SSE
  await this.logService.append({
    logId,
    eventType: 'milestone_progress', // or milestone_started/completed based on status
    timestamp: new Date(),
    data: {
      nodeId,
      milestoneId,
      stage,
      template,
      templateData: data,
      formattedDescription,
      progress,
      status
    }
  });
}
```

**Dependencies:** Task 1.1
**Acceptance:** Milestone events appear in `log.${logId}` event stream

---

#### Task 1.3: Add milestone transformation to SSE controller

**File:** `src/research/research-stream.controller.ts`

Add case to `extractUIData()` method:

```typescript
case 'milestone_started':
case 'milestone_progress':
case 'milestone_completed':
  return {
    nodeId: entry.data?.nodeId,
    milestoneId: entry.data?.milestoneId,
    stage: entry.data?.stage,
    template: entry.data?.template,
    templateData: entry.data?.templateData,
    description: entry.data?.formattedDescription,
    progress: entry.data?.progress,
    status: entry.data?.status
  };
```

**Dependencies:** Task 1.2
**Acceptance:** SSE events contain properly formatted milestone data

---

### Phase 2: Frontend Event Handling (3 tasks)

#### Task 2.1: Add milestone event listeners

**File:** `client/src/app/core/services/agent-activity.service.ts`

Add to `connectToStream()`:

```typescript
this.eventSource.addEventListener('milestone_started', (event) => {
  this.handleMilestoneEvent(JSON.parse(event.data), 'started');
});

this.eventSource.addEventListener('milestone_progress', (event) => {
  this.handleMilestoneEvent(JSON.parse(event.data), 'progress');
});

this.eventSource.addEventListener('milestone_completed', (event) => {
  this.handleMilestoneEvent(JSON.parse(event.data), 'completed');
});
```

**Dependencies:** Task 1.3
**Acceptance:** Frontend receives milestone events in console

---

#### Task 2.2: Add milestone state management

**File:** `client/src/app/core/services/agent-activity.service.ts`

Add signals and handler:

```typescript
// New signals
activeMilestones = signal<MilestoneTask[]>([]);
currentMilestone = signal<MilestoneTask | null>(null);

// Handler method
private handleMilestoneEvent(data: any, eventType: 'started' | 'progress' | 'completed'): void {
  const milestone: MilestoneTask = {
    id: data.milestoneId,
    nodeId: data.nodeId,
    stage: data.stage,
    template: data.template,
    templateData: data.templateData,
    description: data.description,
    progress: data.progress,
    status: this.mapMilestoneStatus(eventType, data.status),
    timestamp: new Date()
  };

  if (eventType === 'started') {
    this.activeMilestones.update(milestones => [...milestones, milestone]);
    this.currentMilestone.set(milestone);
  } else if (eventType === 'progress') {
    this.updateMilestone(milestone);
  } else if (eventType === 'completed') {
    this.completeMilestone(milestone);
  }
}
```

**Dependencies:** Task 2.1
**Acceptance:** Milestone state updates correctly on events

---

#### Task 2.3: Update ActivityTask model for milestones

**File:** `client/src/app/models/activity-task.model.ts`

Extend or create milestone-specific interface:

```typescript
export interface MilestoneTask {
  id: string;
  nodeId: string;
  stage: 1 | 2 | 3;
  template: string;
  templateData: Record<string, unknown>;
  description: string;  // Formatted template
  progress: number;
  status: TaskStatus;
  timestamp: Date;
}
```

**Dependencies:** None
**Acceptance:** TypeScript types align with backend data

---

### Phase 3: UI Integration (3 tasks)

#### Task 3.1: Create MilestoneIndicator component

**Location:** `client/src/app/features/research/components/milestone-indicator/`

Simple inline indicator showing current milestone:

```typescript
@Component({
  selector: 'app-milestone-indicator',
  template: `
    @if (milestone()) {
      <div class="milestone-indicator" [attr.data-stage]="milestone()?.stage">
        <span class="milestone-icon">{{ getStageIcon(milestone()?.stage) }}</span>
        <span class="milestone-text">{{ milestone()?.description }}</span>
        <span class="milestone-progress">{{ milestone()?.progress }}%</span>
      </div>
    }
  `
})
export class MilestoneIndicatorComponent {
  milestone = input.required<MilestoneTask | null>();

  getStageIcon(stage?: number): string {
    switch(stage) {
      case 1: return '🔍';  // Search
      case 2: return '🌐';  // Fetch
      case 3: return '🤖';  // Synthesis
      default: return '⏳';
    }
  }
}
```

**Dependencies:** Task 2.3
**Acceptance:** Component renders milestone information

---

#### Task 3.2: Integrate milestone into StageProgressHeader

**File:** `client/src/app/features/research/components/stage-progress-header/`

Add milestone display below progress bar:

```html
<div class="stage-progress-header">
  <!-- Existing progress bar -->
  <div class="progress-bar">...</div>

  <!-- New: Milestone indicator -->
  @if (currentMilestone()) {
    <app-milestone-indicator [milestone]="currentMilestone()" />
  }
</div>
```

**Dependencies:** Task 3.1
**Acceptance:** Milestone shows in progress header

---

#### Task 3.3: Add milestone styling

**File:** `client/src/app/features/research/components/milestone-indicator/milestone-indicator.component.scss`

Style the milestone indicator:

```scss
.milestone-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--surface-secondary);
  border-radius: 4px;
  font-size: 0.875rem;
  animation: fadeInSlide 0.3s ease-out;

  &[data-stage="1"] { border-left: 3px solid var(--info); }
  &[data-stage="2"] { border-left: 3px solid var(--warning); }
  &[data-stage="3"] { border-left: 3px solid var(--success); }

  &__icon {
    font-size: 1rem;
  }

  &__text {
    flex: 1;
    color: var(--text-primary);
  }

  &__progress {
    font-weight: 600;
    color: var(--text-secondary);
  }
}
```

**Dependencies:** Task 3.1
**Acceptance:** Milestone displays with proper styling

---

### Phase 4: Testing & Polish (2 tasks)

#### Task 4.1: Add unit tests for milestone flow

**Files:**
- `src/logging/research-logger.service.spec.ts` - Test `logMilestone()` calls LogService
- `client/src/app/core/services/agent-activity.service.spec.ts` - Test milestone handlers

**Acceptance:** Tests pass for milestone event flow

---

#### Task 4.2: E2E verification

Run a research query and verify:
1. Milestones appear in SSE stream
2. Frontend receives all milestone events
3. UI updates with milestone progress
4. Milestone descriptions show formatted templates

**Acceptance:** Full flow works from pipeline to UI

---

## Implementation Order

```
Phase 1 (Backend)          Phase 2 (Frontend)         Phase 3 (UI)
     │                           │                         │
     ▼                           ▼                         ▼
┌─────────┐               ┌─────────────┐           ┌───────────────┐
│ Task 1.1│               │  Task 2.3   │           │   Task 3.1    │
│  Enum   │               │   Model     │           │   Component   │
└────┬────┘               └─────────────┘           └───────┬───────┘
     │                                                      │
     ▼                                                      ▼
┌─────────┐               ┌─────────────┐           ┌───────────────┐
│ Task 1.2│──────────────▶│  Task 2.1   │           │   Task 3.2    │
│ Routing │               │  Listeners  │           │  Integration  │
└────┬────┘               └──────┬──────┘           └───────┬───────┘
     │                           │                          │
     ▼                           ▼                          ▼
┌─────────┐               ┌─────────────┐           ┌───────────────┐
│ Task 1.3│               │  Task 2.2   │──────────▶│   Task 3.3    │
│  SSE    │               │   State     │           │   Styling     │
└─────────┘               └─────────────┘           └───────────────┘

Parallel paths: 1.1→1.2→1.3 | 2.3 | 3.1
Sequential: 1.3→2.1→2.2→3.2→3.3
```

---

## Estimated Effort

| Phase | Tasks | Complexity | Estimate |
|-------|-------|------------|----------|
| Phase 1: Backend | 3 | Low | 1-2 hours |
| Phase 2: Frontend | 3 | Low-Medium | 1-2 hours |
| Phase 3: UI | 3 | Low | 1 hour |
| Phase 4: Testing | 2 | Low | 1 hour |
| **Total** | **11** | | **4-6 hours** |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Event channel mismatch | Low | High | Verify EventEmitter channel names match |
| Template formatting issues | Low | Low | `formatMilestoneDescription()` already tested |
| Timing issues (events too fast) | Medium | Low | Frontend signal batching handles this |
| SSE connection drops | Low | Low | Existing reconnection logic applies |

---

## Success Criteria

1. **Backend:** Milestone events flow through LogService to SSE stream
2. **Frontend:** All milestone events received and processed
3. **UI:** Users see formatted milestone messages with progress
4. **Integration:** Milestones update at natural points (20%, 40%, 70%, 90% per stage)

---

## Files Modified

### Backend (3 files)
- `src/logging/interfaces/log-event-type.enum.ts`
- `src/logging/research-logger.service.ts`
- `src/research/research-stream.controller.ts`

### Frontend (4 files)
- `client/src/app/models/activity-task.model.ts`
- `client/src/app/core/services/agent-activity.service.ts`
- `client/src/app/features/research/components/stage-progress-header/` (update)
- `client/src/app/features/research/components/milestone-indicator/` (new)

---

## Appendix: Existing Milestone Templates

**Stage 1: Query Analysis**
```typescript
{ id: 'query_deconstruct', template: 'Deconstructing query into core topics', progress: 20 }
{ id: 'key_terms', template: 'Identifying key terms: {terms}', progress: 40 }
{ id: 'database_search', template: 'Searching {count} databases: {sources}', progress: 70 }
{ id: 'filter_results', template: 'Filtering results for credibility', progress: 90 }
```

**Stage 2: Content Fetch**
```typescript
{ id: 'fetch_sources', template: 'Fetching {count} relevant sources', progress: 30 }
{ id: 'extract_content', template: 'Extracting content from {url}', progress: 60 }
{ id: 'validate_quality', template: 'Validating content quality', progress: 95 }
```

**Stage 3: Synthesis**
```typescript
{ id: 'analyze_sources', template: 'Analyzing {count} sources', progress: 20 }
{ id: 'synthesize_findings', template: 'Synthesizing key findings', progress: 50 }
{ id: 'generate_answer', template: 'Generating comprehensive answer', progress: 80 }
{ id: 'format_response', template: 'Formatting final response', progress: 95 }
```
