# Agent Activity Real-Time UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a real-time agent activity view that shows users live progress during research execution with granular task visibility, error handling, and simple history.

**Architecture:** SSE-based real-time streaming from backend to Angular frontend. Backend emits milestone events with predefined templates + dynamic data. Frontend service manages SSE connection and transforms events into UI state using Angular signals. Component hierarchy shows stages, active tasks, and results.

**Tech Stack:** NestJS (backend), Angular 19 (signals, standalone components), RxJS (SSE), TypeScript, SCSS

---

## Phase 1: Backend Foundation

### Task 1.1: Create Milestone Event Types

**Files:**
- Modify: `src/logging/interfaces/enhanced-log-entry.interface.ts`
- Test: Manual verification via TypeScript compilation

**Step 1: Add milestone-specific types**

Add to `enhanced-log-entry.interface.ts`:

```typescript
export interface MilestoneTemplate {
  id: string;
  stage: 1 | 2 | 3;
  template: string;  // e.g., "Searching {count} databases: {sources}"
  expectedProgress: number;  // 0-100
  order: number;  // Execution order within stage
}

export interface MilestoneData {
  milestoneId: string;
  stage: 1 | 2 | 3;
  template: string;
  data: Record<string, any>;  // Dynamic values for template placeholders
  progress: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  timestamp: string;
}

export interface MilestoneEvent extends NodeLifecycleEvent {
  event: 'milestone';
  milestone: MilestoneData;
}
```

**Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add src/logging/interfaces/enhanced-log-entry.interface.ts
git commit -m "feat: add milestone event types for real-time progress"
```

### Task 1.2: Create Milestone Templates Configuration

**Files:**
- Create: `src/logging/milestone-templates.ts`

**Step 1: Create milestone templates file**

Create `src/logging/milestone-templates.ts`:

```typescript
import { MilestoneTemplate } from './interfaces/enhanced-log-entry.interface';

export const MILESTONE_TEMPLATES: Record<string, MilestoneTemplate[]> = {
  stage1: [
    {
      id: 'stage1_deconstruct',
      stage: 1,
      template: 'Deconstructing query into core topics',
      expectedProgress: 20,
      order: 1,
    },
    {
      id: 'stage1_identify_terms',
      stage: 1,
      template: 'Identifying key terms: {terms}',
      expectedProgress: 40,
      order: 2,
    },
    {
      id: 'stage1_search',
      stage: 1,
      template: 'Searching {count} databases: {sources}',
      expectedProgress: 70,
      order: 3,
    },
    {
      id: 'stage1_filter',
      stage: 1,
      template: 'Filtering results for credibility',
      expectedProgress: 90,
      order: 4,
    },
  ],
  stage2: [
    {
      id: 'stage2_fetch',
      stage: 2,
      template: 'Fetching {count} relevant sources',
      expectedProgress: 30,
      order: 1,
    },
    {
      id: 'stage2_extract',
      stage: 2,
      template: 'Extracting content from {url}',
      expectedProgress: 70,
      order: 2,
    },
    {
      id: 'stage2_validate',
      stage: 2,
      template: 'Validating content quality',
      expectedProgress: 95,
      order: 3,
    },
  ],
  stage3: [
    {
      id: 'stage3_analyze',
      stage: 3,
      template: 'Analyzing {count} sources',
      expectedProgress: 20,
      order: 1,
    },
    {
      id: 'stage3_synthesize',
      stage: 3,
      template: 'Synthesizing key findings',
      expectedProgress: 50,
      order: 2,
    },
    {
      id: 'stage3_generate',
      stage: 3,
      template: 'Generating comprehensive answer',
      expectedProgress: 80,
      order: 3,
    },
    {
      id: 'stage3_format',
      stage: 3,
      template: 'Formatting final response',
      expectedProgress: 95,
      order: 4,
    },
  ],
};

// Helper to get templates for a stage
export function getMilestoneTemplates(stage: 1 | 2 | 3): MilestoneTemplate[] {
  return MILESTONE_TEMPLATES[`stage${stage}`] || [];
}

// Helper to format milestone description
export function formatMilestoneDescription(
  template: string,
  data: Record<string, any>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(`{${key}}`, String(value));
  }
  return result;
}
```

**Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/logging/milestone-templates.ts
git commit -m "feat: add milestone template configurations for stages 1-3"
```

### Task 1.3: Add Milestone Emission to ResearchLogger

**Files:**
- Modify: `src/logging/research-logger.service.ts`

**Step 1: Import milestone types and templates**

Add imports at top of `research-logger.service.ts`:

```typescript
import {
  MilestoneEvent,
  MilestoneData,
} from './interfaces/enhanced-log-entry.interface';
import { formatMilestoneDescription } from './milestone-templates';
```

**Step 2: Add logMilestone method**

Add method to `ResearchLogger` class:

```typescript
logMilestone(
  logId: string,
  nodeId: string,
  milestoneId: string,
  stage: 1 | 2 | 3,
  template: string,
  data: Record<string, any>,
  progress: number,
  status: 'pending' | 'running' | 'completed' | 'error' = 'running',
): void {
  const timestamp = new Date().toISOString();

  const milestoneData: MilestoneData = {
    milestoneId,
    stage,
    template,
    data,
    progress,
    status,
    timestamp,
  };

  // 1. Persist to database
  const logEntry: Partial<EnhancedLogEntry> = {
    logId,
    nodeId,
    nodeType: 'stage',
    stage,
    component: 'milestone',
    operation: 'progress',
    input: { template, data },
    output: { progress, status },
    status,
    timestamp,
    startTime: timestamp,
  };

  // Save to database (reuse existing save logic)
  this.saveEnhancedEntry(logEntry as EnhancedLogEntry);

  // 2. Emit SSE event
  const event: MilestoneEvent = {
    logId,
    nodeId,
    parentNodeId: `stage${stage}`,
    nodeType: 'stage',
    event: 'milestone',
    timestamp,
    milestone: milestoneData,
  };

  this.eventEmitter.emit(`event:${logId}`, event);
  this.eventEmitter.emit('event:*', event);
}
```

**Step 3: Verify TypeScript compilation**

Run: `npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/logging/research-logger.service.ts
git commit -m "feat: add milestone logging and SSE emission to ResearchLogger"
```

### Task 1.4: Integrate Milestones into Pipeline Executor

**Files:**
- Modify: `src/research/pipeline-executor.service.ts`

**Step 1: Import milestone dependencies**

Add imports:

```typescript
import { getMilestoneTemplates } from '../logging/milestone-templates';
```

**Step 2: Add milestone emission for Stage 1**

Find the `executeStage1` method and add milestone calls:

```typescript
private async executeStage1(logId: string, query: string, nodeId: string): Promise<any> {
  const stageTemplates = getMilestoneTemplates(1);

  // Milestone 1: Deconstructing query
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_1`,
    stageTemplates[0].id,
    1,
    stageTemplates[0].template,
    {},
    stageTemplates[0].expectedProgress,
    'running',
  );

  // ... existing query analysis logic ...

  // Milestone 2: Identifying terms (extract from LLM response)
  const terms = this.extractKeyTerms(llmResponse); // Implement this helper
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_2`,
    stageTemplates[1].id,
    1,
    stageTemplates[1].template,
    { terms: terms.join(', ') },
    stageTemplates[1].expectedProgress,
    'running',
  );

  // Milestone 3: Searching databases
  const searchCount = 25; // Or get from config
  const sources = 'NASA, arXiv, Nature, Science'; // Or get from actual sources
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_3`,
    stageTemplates[2].id,
    1,
    stageTemplates[2].template,
    { count: searchCount, sources },
    stageTemplates[2].expectedProgress,
    'running',
  );

  // ... existing search logic ...

  // Milestone 4: Filtering results
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_4`,
    stageTemplates[3].id,
    1,
    stageTemplates[3].template,
    {},
    stageTemplates[3].expectedProgress,
    'completed',
  );

  return stage1Result;
}
```

**Step 3: Add helper method to extract key terms**

Add helper method to class:

```typescript
private extractKeyTerms(llmResponse: any): string[] {
  // Extract terms from LLM response
  // This is a simplified implementation
  if (llmResponse?.keyTerms) {
    return llmResponse.keyTerms;
  }
  // Fallback: extract from query or response text
  return [];
}
```

**Step 4: Verify TypeScript compilation**

Run: `npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add src/research/pipeline-executor.service.ts
git commit -m "feat: integrate stage 1 milestone emission into pipeline"
```

### Task 1.5: Add Milestones for Stage 2 and Stage 3

**Files:**
- Modify: `src/research/pipeline-executor.service.ts`

**Step 1: Add Stage 2 milestones**

In `executeStage2` method:

```typescript
private async executeStage2(logId: string, stage1Result: any, nodeId: string): Promise<any> {
  const stageTemplates = getMilestoneTemplates(2);
  const sources = stage1Result.sources || [];

  // Milestone 1: Fetching sources
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_1`,
    stageTemplates[0].id,
    2,
    stageTemplates[0].template,
    { count: sources.length },
    stageTemplates[0].expectedProgress,
    'running',
  );

  // ... existing fetch logic ...

  // Milestone 2: Extracting content (emit for each source)
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const progress = 10 + (i / sources.length) * 80; // 10-90%

    this.logger.logMilestone(
      logId,
      `${nodeId}_milestone_2_${i}`,
      stageTemplates[1].id,
      2,
      stageTemplates[1].template,
      { url: source.url },
      progress,
      'running',
    );

    // ... fetch and extract content ...
  }

  // Milestone 3: Validating content
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_3`,
    stageTemplates[2].id,
    2,
    stageTemplates[2].template,
    {},
    stageTemplates[2].expectedProgress,
    'completed',
  );

  return stage2Result;
}
```

**Step 2: Add Stage 3 milestones**

In `executeStage3` method:

```typescript
private async executeStage3(logId: string, stage2Result: any, nodeId: string): Promise<any> {
  const stageTemplates = getMilestoneTemplates(3);
  const sourceCount = stage2Result.fetchedSources?.length || 0;

  // Milestone 1: Analyzing sources
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_1`,
    stageTemplates[0].id,
    3,
    stageTemplates[0].template,
    { count: sourceCount },
    stageTemplates[0].expectedProgress,
    'running',
  );

  // ... existing analysis logic ...

  // Milestone 2: Synthesizing findings
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_2`,
    stageTemplates[1].id,
    3,
    stageTemplates[1].template,
    {},
    stageTemplates[1].expectedProgress,
    'running',
  );

  // ... synthesis logic ...

  // Milestone 3: Generating answer
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_3`,
    stageTemplates[2].id,
    3,
    stageTemplates[2].template,
    {},
    stageTemplates[2].expectedProgress,
    'running',
  );

  // ... answer generation ...

  // Milestone 4: Formatting response
  this.logger.logMilestone(
    logId,
    `${nodeId}_milestone_4`,
    stageTemplates[3].id,
    3,
    stageTemplates[3].template,
    {},
    stageTemplates[3].expectedProgress,
    'completed',
  );

  return stage3Result;
}
```

**Step 3: Verify TypeScript compilation**

Run: `npm run build`
Expected: No errors

**Step 4: Test milestone emission**

Run: `npm run start:dev`
Submit a test query and check logs for milestone events
Expected: See milestone events in console and SSE stream

**Step 5: Commit**

```bash
git add src/research/pipeline-executor.service.ts
git commit -m "feat: add stage 2 and 3 milestone emission to pipeline"
```

---

## Phase 2: Frontend Service

### Task 2.1: Create Activity Task Model

**Files:**
- Create: `client/src/app/models/activity-task.model.ts`
- Modify: `client/src/app/models/index.ts`

**Step 1: Create activity task model**

Create `client/src/app/models/activity-task.model.ts`:

```typescript
export type TaskStatus = 'pending' | 'running' | 'completed' | 'error' | 'retrying';
export type TaskType = 'stage' | 'tool' | 'milestone';

export interface ActivityTask {
  id: string;
  nodeId: string;
  stage: 1 | 2 | 3;
  type: TaskType;
  description: string;
  progress: number;  // 0-100
  status: TaskStatus;
  timestamp: Date;
  duration?: number;
  error?: {
    message: string;
    code?: string;
    timestamp: Date;
  };
  retryCount: number;
  canRetry: boolean;
  data?: Record<string, any>;
}

export interface MilestoneEventData {
  logId: string;
  nodeId: string;
  parentNodeId?: string;
  nodeType: string;
  event: 'start' | 'progress' | 'complete' | 'error' | 'milestone';
  timestamp: string;
  milestone?: {
    milestoneId: string;
    stage: 1 | 2 | 3;
    template: string;
    data: Record<string, any>;
    progress: number;
    status: TaskStatus;
    timestamp: string;
  };
  data?: any;
  status?: TaskStatus;
}
```

**Step 2: Export from index**

Add to `client/src/app/models/index.ts`:

```typescript
export * from './activity-task.model';
```

**Step 3: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add client/src/app/models/activity-task.model.ts client/src/app/models/index.ts
git commit -m "feat: add activity task model for real-time UI"
```

### Task 2.2: Create AgentActivityService

**Files:**
- Create: `client/src/app/core/services/agent-activity.service.ts`

**Step 1: Create service file**

Create `client/src/app/core/services/agent-activity.service.ts`:

```typescript
import { Injectable, signal, computed } from '@angular/core';
import { ActivityTask, MilestoneEventData, TaskStatus } from '../../models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AgentActivityService {
  // Signals for reactive state
  currentStage = signal<number>(1);
  activeTasks = signal<ActivityTask[]>([]);
  completedTasks = signal<ActivityTask[]>([]);
  stageProgress = signal<number>(0);
  isComplete = signal<boolean>(false);
  isConnected = signal<boolean>(false);
  connectionError = signal<string | null>(null);

  // Computed signals
  allTasks = computed(() => [...this.activeTasks(), ...this.completedTasks()]);
  hasActiveTasks = computed(() => this.activeTasks().length > 0);
  hasErrors = computed(() =>
    this.activeTasks().some(t => t.status === 'error')
  );

  private eventSource: EventSource | null = null;
  private currentLogId: string | null = null;

  connectToStream(logId: string): void {
    // Close existing connection
    this.disconnect();

    this.currentLogId = logId;
    this.resetState();

    const url = `${environment.apiUrl}/research/stream/events/${logId}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.isConnected.set(true);
      this.connectionError.set(null);
    };

    this.eventSource.onerror = () => {
      this.isConnected.set(false);
      this.connectionError.set('Connection lost. Reconnecting...');
      // EventSource auto-reconnects, so just update status
    };

    // Listen for different event types
    this.eventSource.addEventListener('node-start', (e: MessageEvent) => {
      this.handleTaskStart(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('node-milestone', (e: MessageEvent) => {
      this.handleMilestone(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('node-progress', (e: MessageEvent) => {
      this.handleProgress(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('node-complete', (e: MessageEvent) => {
      this.handleTaskComplete(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('node-error', (e: MessageEvent) => {
      this.handleTaskError(JSON.parse(e.data));
    });
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected.set(false);
    }
    this.currentLogId = null;
  }

  private resetState(): void {
    this.currentStage.set(1);
    this.activeTasks.set([]);
    this.completedTasks.set([]);
    this.stageProgress.set(0);
    this.isComplete.set(false);
    this.connectionError.set(null);
  }

  private handleTaskStart(event: MilestoneEventData): void {
    // Implementation in next task
  }

  private handleMilestone(event: MilestoneEventData): void {
    // Implementation in next task
  }

  private handleProgress(event: MilestoneEventData): void {
    // Implementation in next task
  }

  private handleTaskComplete(event: MilestoneEventData): void {
    // Implementation in next task
  }

  private handleTaskError(event: MilestoneEventData): void {
    // Implementation in next task
  }
}
```

**Step 2: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/app/core/services/agent-activity.service.ts
git commit -m "feat: create AgentActivityService with SSE connection management"
```

### Task 2.3: Implement Event Handlers

**Files:**
- Modify: `client/src/app/core/services/agent-activity.service.ts`

**Step 1: Implement handleMilestone**

Replace the empty `handleMilestone` method:

```typescript
private handleMilestone(event: MilestoneEventData): void {
  if (!event.milestone) return;

  const milestone = event.milestone;
  const taskId = milestone.milestoneId;

  // Check if task already exists
  const existingTaskIndex = this.activeTasks().findIndex(t => t.id === taskId);

  if (existingTaskIndex >= 0) {
    // Update existing task
    this.activeTasks.update(tasks => {
      const updated = [...tasks];
      updated[existingTaskIndex] = {
        ...updated[existingTaskIndex],
        description: this.formatDescription(milestone.template, milestone.data),
        progress: milestone.progress,
        status: milestone.status as TaskStatus,
      };
      return updated;
    });
  } else {
    // Create new task
    const newTask: ActivityTask = {
      id: taskId,
      nodeId: event.nodeId,
      stage: milestone.stage,
      type: 'milestone',
      description: this.formatDescription(milestone.template, milestone.data),
      progress: milestone.progress,
      status: milestone.status as TaskStatus,
      timestamp: new Date(milestone.timestamp),
      retryCount: 0,
      canRetry: false,
      data: milestone.data,
    };

    this.activeTasks.update(tasks => [...tasks, newTask]);
  }

  // Update current stage
  if (milestone.stage !== this.currentStage()) {
    this.currentStage.set(milestone.stage);
  }

  // Calculate stage progress
  this.updateStageProgress();
}

private formatDescription(template: string, data: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(`{${key}}`, String(value));
  }
  return result;
}
```

**Step 2: Implement handleProgress**

Replace the empty `handleProgress` method:

```typescript
private handleProgress(event: MilestoneEventData): void {
  const nodeId = event.nodeId;

  this.activeTasks.update(tasks => {
    const index = tasks.findIndex(t => t.nodeId === nodeId);
    if (index >= 0) {
      const updated = [...tasks];
      updated[index] = {
        ...updated[index],
        progress: event.data?.progress || updated[index].progress,
      };
      return updated;
    }
    return tasks;
  });

  this.updateStageProgress();
}
```

**Step 3: Implement handleTaskComplete**

Replace the empty `handleTaskComplete` method:

```typescript
private handleTaskComplete(event: MilestoneEventData): void {
  const nodeId = event.nodeId;

  this.activeTasks.update(tasks => {
    const index = tasks.findIndex(t => t.nodeId === nodeId);
    if (index >= 0) {
      const completed = {
        ...tasks[index],
        status: 'completed' as TaskStatus,
        progress: 100,
      };

      // Move to completed tasks
      this.completedTasks.update(completed => [...completed, completed]);

      // Remove from active
      return tasks.filter((_, i) => i !== index);
    }
    return tasks;
  });

  // Check if all stages complete
  if (this.currentStage() === 3 && this.activeTasks().length === 0) {
    this.isComplete.set(true);
  }

  this.updateStageProgress();
}
```

**Step 4: Implement handleTaskError**

Replace the empty `handleTaskError` method:

```typescript
private handleTaskError(event: MilestoneEventData): void {
  const nodeId = event.nodeId;

  this.activeTasks.update(tasks => {
    const index = tasks.findIndex(t => t.nodeId === nodeId);
    if (index >= 0) {
      const updated = [...tasks];
      updated[index] = {
        ...updated[index],
        status: 'error' as TaskStatus,
        error: {
          message: event.data?.error?.message || 'Unknown error',
          code: event.data?.error?.code,
          timestamp: new Date(),
        },
        canRetry: true,
      };
      return updated;
    }
    return tasks;
  });
}
```

**Step 5: Implement updateStageProgress**

Add helper method:

```typescript
private updateStageProgress(): void {
  const tasks = this.activeTasks();
  if (tasks.length === 0) {
    this.stageProgress.set(100);
    return;
  }

  const totalProgress = tasks.reduce((sum, task) => sum + task.progress, 0);
  const avgProgress = totalProgress / tasks.length;
  this.stageProgress.set(Math.round(avgProgress));
}
```

**Step 6: Implement handleTaskStart (stub for tool starts)**

Replace the empty `handleTaskStart` method:

```typescript
private handleTaskStart(event: MilestoneEventData): void {
  // Tool/stage starts - create placeholder task if needed
  const existingTask = this.activeTasks().find(t => t.nodeId === event.nodeId);

  if (!existingTask) {
    const newTask: ActivityTask = {
      id: `task_${event.nodeId}`,
      nodeId: event.nodeId,
      stage: this.currentStage(),
      type: event.nodeType as TaskType || 'tool',
      description: event.data?.description || 'Processing...',
      progress: 0,
      status: 'running',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };

    this.activeTasks.update(tasks => [...tasks, newTask]);
  }
}
```

**Step 7: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 8: Commit**

```bash
git add client/src/app/core/services/agent-activity.service.ts
git commit -m "feat: implement event handlers for agent activity service"
```

---

## Phase 3: UI Components

### Task 3.1: Create Stage Progress Header Component

**Files:**
- Create: `client/src/app/features/research/components/stage-progress-header/stage-progress-header.ts`
- Create: `client/src/app/features/research/components/stage-progress-header/stage-progress-header.html`
- Create: `client/src/app/features/research/components/stage-progress-header/stage-progress-header.scss`

**Step 1: Create TypeScript component**

Create `stage-progress-header.ts`:

```typescript
import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stage-progress-header',
  imports: [CommonModule],
  templateUrl: './stage-progress-header.html',
  styleUrls: ['./stage-progress-header.scss']
})
export class StageProgressHeaderComponent {
  stage = input.required<number>();
  progress = input.required<number>();

  getStageName(stage: number): string {
    const names: Record<number, string> = {
      1: 'Analyzing query & searching',
      2: 'Content fetch & selection',
      3: 'Synthesis & answer generation'
    };
    return names[stage] || `Stage ${stage}`;
  }

  getStageIcon(stage: number): string {
    const icons: Record<number, string> = { 1: '🔍', 2: '📄', 3: '✨' };
    return icons[stage] || '📋';
  }
}
```

**Step 2: Create template**

Create `stage-progress-header.html`:

```html
<div class="stage-header">
  <div class="stage-info">
    <span class="stage-icon">{{ getStageIcon(stage()) }}</span>
    <h2 class="stage-title">
      Stage {{ stage() }} of 3: {{ getStageName(stage()) }}
    </h2>
  </div>

  <div class="progress-container">
    <div class="progress-bar">
      <div
        class="progress-fill"
        [style.width.%]="progress()">
      </div>
    </div>
    <span class="progress-text">{{ progress() }}%</span>
  </div>
</div>
```

**Step 3: Create styles**

Create `stage-progress-header.scss`:

```scss
.stage-header {
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 1.5rem;
}

.stage-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.stage-icon {
  font-size: 1.5rem;
}

.stage-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #10b981);
  transition: width 0.5s ease-in-out;
}

.progress-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  min-width: 3rem;
  text-align: right;
}
```

**Step 4: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add client/src/app/features/research/components/stage-progress-header/
git commit -m "feat: create stage progress header component"
```

### Task 3.2: Create Task Card Component

**Files:**
- Create: `client/src/app/features/research/components/task-card/task-card.ts`
- Create: `client/src/app/features/research/components/task-card/task-card.html`
- Create: `client/src/app/features/research/components/task-card/task-card.scss`

**Step 1: Create TypeScript component**

Create `task-card.ts`:

```typescript
import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityTask } from '../../../../models';

@Component({
  selector: 'app-task-card',
  imports: [CommonModule],
  templateUrl: './task-card.html',
  styleUrls: ['./task-card.scss']
})
export class TaskCardComponent {
  task = input.required<ActivityTask>();
  retry = output<string>();

  onRetry(): void {
    this.retry.emit(this.task().id);
  }

  getStatusClass(): string {
    const status = this.task().status;
    return `status-${status}`;
  }

  getStatusIcon(): string {
    const icons: Record<string, string> = {
      pending: '⏳',
      running: '🔄',
      completed: '✓',
      error: '⚠️',
      retrying: '↻'
    };
    return icons[this.task().status] || '•';
  }

  getProgressBarClass(): string {
    const status = this.task().status;
    if (status === 'completed') return 'progress-success';
    if (status === 'error') return 'progress-error';
    if (status === 'retrying') return 'progress-warning';
    return 'progress-active';
  }
}
```

**Step 2: Create template**

Create `task-card.html`:

```html
<div class="task-card" [ngClass]="getStatusClass()">
  <div class="task-header">
    <span class="status-icon">{{ getStatusIcon() }}</span>
    <span class="task-description">{{ task().description }}</span>
    @if (task().status === 'error' && task().canRetry) {
      <button class="retry-button" (click)="onRetry()">
        ↻ Retry
      </button>
    }
  </div>

  <div class="task-progress">
    <div class="progress-bar">
      <div
        class="progress-fill"
        [ngClass]="getProgressBarClass()"
        [style.width.%]="task().progress">
      </div>
    </div>
    <span class="progress-percentage">{{ task().progress }}%</span>
  </div>

  @if (task().error) {
    <div class="error-message">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{{ task().error.message }}</span>
    </div>
  }
</div>
```

**Step 3: Create styles**

Create `task-card.scss`:

```scss
.task-card {
  padding: 1rem;
  background: white;
  border-radius: 6px;
  border-left: 4px solid transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  animation: fadeInSlide 0.3s ease-out;

  &.status-running {
    border-left-color: #3b82f6;
  }

  &.status-completed {
    border-left-color: #10b981;
  }

  &.status-error {
    border-left-color: #ef4444;
  }

  &.status-retrying {
    border-left-color: #f59e0b;
  }

  &.status-pending {
    border-left-color: #9ca3af;
  }
}

.task-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.status-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.task-description {
  flex: 1;
  font-size: 0.9375rem;
  color: #374151;
  line-height: 1.5;
}

.retry-button {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  color: #3b82f6;
  background: #eff6ff;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #3b82f6;
    color: white;
  }
}

.task-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  transition: width 0.5s ease-in-out;

  &.progress-active {
    background: #3b82f6;
  }

  &.progress-success {
    background: #10b981;
  }

  &.progress-error {
    background: #ef4444;
  }

  &.progress-warning {
    background: #f59e0b;
  }
}

.progress-percentage {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #6b7280;
  min-width: 2.5rem;
  text-align: right;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding: 0.5rem;
  background: #fef2f2;
  border-radius: 4px;
}

.error-icon {
  color: #ef4444;
  font-size: 1rem;
}

.error-text {
  flex: 1;
  font-size: 0.875rem;
  color: #991b1b;
}

@keyframes fadeInSlide {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Step 4: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add client/src/app/features/research/components/task-card/
git commit -m "feat: create task card component with all states"
```

### Task 3.3: Create Agent Activity View Component

**Files:**
- Create: `client/src/app/features/research/components/agent-activity-view/agent-activity-view.ts`
- Create: `client/src/app/features/research/components/agent-activity-view/agent-activity-view.html`
- Create: `client/src/app/features/research/components/agent-activity-view/agent-activity-view.scss`

**Step 1: Create TypeScript component**

Create `agent-activity-view.ts`:

```typescript
import { Component, inject, input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgentActivityService } from '../../../../core/services/agent-activity.service';
import { StageProgressHeaderComponent } from '../stage-progress-header/stage-progress-header';
import { TaskCardComponent } from '../task-card/task-card';

@Component({
  selector: 'app-agent-activity-view',
  imports: [
    CommonModule,
    StageProgressHeaderComponent,
    TaskCardComponent
  ],
  templateUrl: './agent-activity-view.html',
  styleUrls: ['./agent-activity-view.scss']
})
export class AgentActivityViewComponent implements OnInit, OnDestroy {
  logId = input.required<string>();

  activityService = inject(AgentActivityService);

  ngOnInit(): void {
    const id = this.logId();
    if (id) {
      this.activityService.connectToStream(id);
    }
  }

  ngOnDestroy(): void {
    this.activityService.disconnect();
  }

  onRetryTask(taskId: string): void {
    // TODO: Implement retry logic in Phase 5
    console.log('Retry task:', taskId);
  }
}
```

**Step 2: Create template**

Create `agent-activity-view.html`:

```html
<div class="agent-activity-container">
  @if (activityService.isConnected()) {
    <app-stage-progress-header
      [stage]="activityService.currentStage()"
      [progress]="activityService.stageProgress()">
    </app-stage-progress-header>

    <div class="tasks-section">
      <h3 class="section-title">Active Tasks</h3>

      @if (activityService.hasActiveTasks()) {
        <div class="tasks-list">
          @for (task of activityService.activeTasks(); track task.id) {
            <app-task-card
              [task]="task"
              (retry)="onRetryTask($event)">
            </app-task-card>
          }
        </div>
      } @else if (activityService.isComplete()) {
        <div class="completion-message">
          <span class="completion-icon">✓</span>
          <span class="completion-text">Research complete!</span>
        </div>
      } @else {
        <div class="loading-message">
          <span class="loading-icon">⏳</span>
          <span class="loading-text">Initializing research...</span>
        </div>
      }
    </div>

    @if (activityService.completedTasks().length > 0) {
      <div class="completed-section">
        <details>
          <summary class="completed-summary">
            Completed Tasks ({{ activityService.completedTasks().length }})
          </summary>
          <div class="tasks-list">
            @for (task of activityService.completedTasks(); track task.id) {
              <app-task-card [task]="task"></app-task-card>
            }
          </div>
        </details>
      </div>
    }
  } @else {
    <div class="connection-status">
      @if (activityService.connectionError()) {
        <div class="error-banner">
          <span class="error-icon">⚠️</span>
          <span>{{ activityService.connectionError() }}</span>
        </div>
      } @else {
        <div class="connecting-message">
          <span class="spinner">⟳</span>
          <span>Connecting to research agent...</span>
        </div>
      }
    </div>
  }
</div>
```

**Step 3: Create styles**

Create `agent-activity-view.scss`:

```scss
.agent-activity-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
}

.tasks-section {
  margin-bottom: 2rem;
}

.section-title {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
}

.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.completion-message,
.loading-message {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.completion-icon {
  font-size: 2rem;
  color: #10b981;
}

.completion-text {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
}

.loading-icon {
  font-size: 2rem;
  color: #3b82f6;
  animation: pulse 2s ease-in-out infinite;
}

.loading-text {
  font-size: 1rem;
  color: #6b7280;
}

.completed-section {
  margin-top: 1.5rem;
}

.completed-summary {
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  color: #6b7280;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }

  &:hover {
    background: #f3f4f6;
  }
}

.connection-status {
  padding: 2rem;
  text-align: center;
}

.error-banner {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: #fef2f2;
  border: 1px solid #fee2e2;
  border-radius: 6px;
  color: #991b1b;
}

.connecting-message {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1rem;
  color: #6b7280;
}

.spinner {
  font-size: 1.5rem;
  animation: spin 1s linear infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .agent-activity-container {
    padding: 1rem;
  }
}
```

**Step 4: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add client/src/app/features/research/components/agent-activity-view/
git commit -m "feat: create agent activity view container component"
```

### Task 3.4: Integrate Activity View into Research Component

**Files:**
- Modify: `client/src/app/features/research/research.ts`
- Modify: `client/src/app/features/research/research.html`
- Modify: `client/src/app/core/services/research.service.ts`

**Step 1: Add logId to research service**

Modify `research.service.ts` to expose logId:

```typescript
// Add signal
currentLogId = signal<string | null>(null);

// In submitQuery method, after successful response:
if (result) {
  const fullResult: ResearchResult = {
    ...result,
    query,
    timestamp: new Date()
  };

  // Set logId if available in response
  if (result.logId) {
    this.currentLogId.set(result.logId);
  }

  this.currentResult.set(fullResult);
  // ... rest of existing code
}
```

**Step 2: Import activity view in research component**

Modify `research.ts`:

```typescript
import { AgentActivityViewComponent } from './components/agent-activity-view/agent-activity-view';

@Component({
  selector: 'app-research',
  standalone: true,
  imports: [
    CommonModule,
    SearchInputComponent,
    LoadingIndicatorComponent,
    ResultCardComponent,
    ErrorMessageComponent,
    AgentActivityViewComponent  // Add this
  ],
  templateUrl: './research.html',
  styleUrl: './research.scss',
})
export class ResearchComponent {
  // ... existing code
}
```

**Step 3: Update research template**

Modify `research.html` to show activity view when loading:

```html
<div class="research-container">
  <app-search-input
    [disabled]="!researchService.canSubmit()"
    (querySubmitted)="onQuerySubmitted($event)">
  </app-search-input>

  @if (researchService.error()) {
    <app-error-message
      [message]="researchService.error()!"
      (retry)="onRetry()"
      (dismiss)="onDismissError()">
    </app-error-message>
  }

  @if (researchService.isLoading() && researchService.currentLogId()) {
    <!-- Show agent activity view during loading -->
    <app-agent-activity-view
      [logId]="researchService.currentLogId()!">
    </app-agent-activity-view>
  } @else if (researchService.isLoading()) {
    <!-- Fallback loader if no logId yet -->
    <app-loading-indicator></app-loading-indicator>
  }

  @if (researchService.currentResult()) {
    <app-result-card
      [result]="researchService.currentResult()!">
    </app-result-card>
  }

  @if (researchService.history().length > 0) {
    <div class="history-section">
      <h2>Research History</h2>
      @for (result of researchService.history(); track result.timestamp) {
        <app-result-card [result]="result"></app-result-card>
      }
    </div>
  }
</div>
```

**Step 4: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 5: Test integration**

Run: `cd client && npm run start`
Navigate to research page and submit a query
Expected: See agent activity view appear with real-time updates

**Step 6: Commit**

```bash
git add client/src/app/features/research/ client/src/app/core/services/research.service.ts
git commit -m "feat: integrate agent activity view into research component"
```

---

## Phase 4: History Integration

### Task 4.1: Create Simple History Component

**Files:**
- Create: `client/src/app/features/research/components/research-history/research-history.ts`
- Create: `client/src/app/features/research/components/research-history/research-history.html`
- Create: `client/src/app/features/research/components/research-history/research-history.scss`

**Step 1: Create component**

Create `research-history.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LogsService } from '../../../../core/services/logs.service';

@Component({
  selector: 'app-research-history',
  imports: [CommonModule],
  templateUrl: './research-history.html',
  styleUrls: ['./research-history.scss']
})
export class ResearchHistoryComponent {
  logsService = inject(LogsService);
  router = inject(Router);

  expandedLogIds = new Set<string>();

  toggleExpand(logId: string): void {
    if (this.expandedLogIds.has(logId)) {
      this.expandedLogIds.delete(logId);
    } else {
      this.expandedLogIds.add(logId);
      // Load details if not already loaded
      if (!this.logsService.logDetail() ||
          this.logsService.selectedLogId() !== logId) {
        this.logsService.selectSession(logId);
      }
    }
  }

  isExpanded(logId: string): boolean {
    return this.expandedLogIds.has(logId);
  }

  viewDetails(logId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/logs', logId]);
  }

  getAnswerPreview(logId: string): string {
    if (this.logsService.selectedLogId() === logId) {
      const detail = this.logsService.logDetail();
      if (detail?.entries) {
        const answerEntry = detail.entries.find(e =>
          e.operation === 'stage_output' && e.stage === 3
        );
        if (answerEntry?.output) {
          const answer = typeof answerEntry.output === 'string'
            ? answerEntry.output
            : answerEntry.output.answer || '';
          return answer.length > 150
            ? answer.substring(0, 150) + '...'
            : answer;
        }
      }
    }
    return 'Loading...';
  }

  getFullAnswer(logId: string): string {
    if (this.logsService.selectedLogId() === logId) {
      const detail = this.logsService.logDetail();
      if (detail?.entries) {
        const answerEntry = detail.entries.find(e =>
          e.operation === 'stage_output' && e.stage === 3
        );
        if (answerEntry?.output) {
          return typeof answerEntry.output === 'string'
            ? answerEntry.output
            : answerEntry.output.answer || '';
        }
      }
    }
    return '';
  }

  getRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  }
}
```

**Step 2: Create template**

Create `research-history.html`:

```html
<div class="history-container">
  <h3 class="history-title">Research History</h3>

  @if (logsService.sessions().length === 0) {
    <div class="empty-state">
      <span class="empty-icon">📝</span>
      <p class="empty-text">No research history yet</p>
      <p class="empty-subtext">Your research queries will appear here</p>
    </div>
  } @else {
    <div class="history-list">
      @for (session of logsService.sessions().slice(0, 20); track session.logId) {
        <div class="history-item" (click)="toggleExpand(session.logId)">
          <div class="item-header">
            <span class="expand-icon">{{ isExpanded(session.logId) ? '▼' : '▶' }}</span>
            <div class="item-content">
              <p class="query-text">{{ session.query }}</p>
              @if (!isExpanded(session.logId)) {
                <p class="answer-preview">{{ getAnswerPreview(session.logId) }}</p>
              }
            </div>
          </div>

          <div class="item-meta">
            <span class="timestamp">{{ getRelativeTime(session.timestamp) }}</span>
            <button
              class="details-link"
              (click)="viewDetails(session.logId, $event)">
              View details
            </button>
          </div>

          @if (isExpanded(session.logId)) {
            <div class="answer-full">
              <p class="answer-text">{{ getFullAnswer(session.logId) }}</p>
            </div>
          }
        </div>
      }
    </div>
  }
</div>
```

**Step 3: Create styles**

Create `research-history.scss`:

```scss
.history-container {
  margin-top: 2rem;
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.history-title {
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
}

.empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 1rem;
}

.empty-text {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: 500;
  color: #374151;
}

.empty-subtext {
  margin: 0;
  font-size: 0.875rem;
  color: #9ca3af;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.history-item {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }
}

.item-header {
  display: flex;
  align-items: start;
  gap: 0.75rem;
}

.expand-icon {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.item-content {
  flex: 1;
}

.query-text {
  margin: 0 0 0.5rem 0;
  font-size: 0.9375rem;
  font-weight: 500;
  color: #1f2937;
}

.answer-preview {
  margin: 0;
  font-size: 0.875rem;
  color: #6b7280;
  line-height: 1.5;
}

.item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e5e7eb;
}

.timestamp {
  font-size: 0.8125rem;
  color: #9ca3af;
}

.details-link {
  padding: 0.25rem 0.75rem;
  font-size: 0.8125rem;
  color: #3b82f6;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  transition: color 0.2s;

  &:hover {
    color: #2563eb;
  }
}

.answer-full {
  margin-top: 1rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 4px;
}

.answer-text {
  margin: 0;
  font-size: 0.9375rem;
  color: #374151;
  line-height: 1.6;
  white-space: pre-wrap;
}
```

**Step 4: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add client/src/app/features/research/components/research-history/
git commit -m "feat: create research history component with expand/collapse"
```

### Task 4.2: Integrate History into Research Page

**Files:**
- Modify: `client/src/app/features/research/research.ts`
- Modify: `client/src/app/features/research/research.html`

**Step 1: Import history component**

Modify `research.ts`:

```typescript
import { ResearchHistoryComponent } from './components/research-history/research-history';
import { LogsService } from '../../core/services/logs.service';

@Component({
  selector: 'app-research',
  standalone: true,
  imports: [
    CommonModule,
    SearchInputComponent,
    LoadingIndicatorComponent,
    ResultCardComponent,
    ErrorMessageComponent,
    AgentActivityViewComponent,
    ResearchHistoryComponent  // Add this
  ],
  templateUrl: './research.html',
  styleUrl: './research.scss',
})
export class ResearchComponent {
  researchService = inject(ResearchService);
  logsService = inject(LogsService);  // Add this

  async onQuerySubmitted(query: string): Promise<void> {
    await this.researchService.submitQuery(query);
    // Refresh sessions after query completes
    await this.logsService.loadSessions();
  }

  // ... rest of existing code
}
```

**Step 2: Update template to include history**

Modify `research.html`:

```html
<div class="research-container">
  <app-search-input
    [disabled]="!researchService.canSubmit()"
    (querySubmitted)="onQuerySubmitted($event)">
  </app-search-input>

  @if (researchService.error()) {
    <app-error-message
      [message]="researchService.error()!"
      (retry)="onRetry()"
      (dismiss)="onDismissError()">
    </app-error-message>
  }

  @if (researchService.isLoading() && researchService.currentLogId()) {
    <app-agent-activity-view
      [logId]="researchService.currentLogId()!">
    </app-agent-activity-view>
  } @else if (researchService.isLoading()) {
    <app-loading-indicator></app-loading-indicator>
  }

  @if (researchService.currentResult()) {
    <app-result-card
      [result]="researchService.currentResult()!">
    </app-result-card>
  }

  <!-- Research History Section -->
  <app-research-history></app-research-history>
</div>
```

**Step 3: Load sessions on init**

Modify `research.ts` to load sessions:

```typescript
export class ResearchComponent implements OnInit {
  // ... existing code

  async ngOnInit(): Promise<void> {
    await this.logsService.loadSessions();
  }
}
```

**Step 4: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 5: Test history**

Run: `cd client && npm run start`
Submit queries and verify history appears
Expected: History shows past queries with expand/collapse

**Step 6: Commit**

```bash
git add client/src/app/features/research/
git commit -m "feat: integrate research history into research page"
```

---

## Phase 5: Error Handling & Retry

### Task 5.1: Create Retry API Endpoint

**Files:**
- Modify: `src/research/research.controller.ts`
- Modify: `src/research/research.service.ts`

**Step 1: Add retry endpoint to controller**

Modify `research.controller.ts`:

```typescript
import { Controller, Post, Body, HttpCode, HttpStatus, Param } from '@nestjs/common';

@Controller('api/research')
export class ResearchController {
  // ... existing code

  @Post('retry/:logId/:nodeId')
  @HttpCode(HttpStatus.OK)
  async retryNode(
    @Param('logId') logId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.researchService.retryNode(logId, nodeId);
  }
}
```

**Step 2: Implement retry logic in service**

Modify `research.service.ts`:

```typescript
async retryNode(
  logId: string,
  nodeId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    // Find the original node/task from logs
    const logEntry = await this.findLogEntry(logId, nodeId);

    if (!logEntry) {
      return {
        success: false,
        message: 'Node not found',
      };
    }

    // Emit retry start event
    this.researchLogger.logEvent(
      logId,
      nodeId,
      'retry',
      'start',
      { originalError: logEntry.error },
    );

    // Re-execute the node based on its type
    let result;
    if (logEntry.component === 'tavily_search') {
      result = await this.retrySearch(logId, nodeId, logEntry);
    } else if (logEntry.component === 'web_fetch') {
      result = await this.retryFetch(logId, nodeId, logEntry);
    } else {
      return {
        success: false,
        message: 'Retry not supported for this node type',
      };
    }

    // Emit success event
    this.researchLogger.logEvent(
      logId,
      nodeId,
      'retry',
      'complete',
      { result },
    );

    return {
      success: true,
      message: 'Node retry successful',
    };
  } catch (error) {
    // Emit error event
    this.researchLogger.logEvent(
      logId,
      nodeId,
      'retry',
      'error',
      { error: error.message },
    );

    return {
      success: false,
      message: error.message || 'Retry failed',
    };
  }
}

private async findLogEntry(logId: string, nodeId: string): Promise<any> {
  // Query database for log entry
  // This is a placeholder - implement based on your DB structure
  return null;
}

private async retrySearch(logId: string, nodeId: string, originalEntry: any): Promise<any> {
  // Re-execute search with original input
  return await this.tavilySearch.search(originalEntry.input);
}

private async retryFetch(logId: string, nodeId: string, originalEntry: any): Promise<any> {
  // Re-execute fetch with original input
  return await this.webFetch.fetch(originalEntry.input);
}
```

**Step 3: Verify TypeScript compilation**

Run: `npm run build`
Expected: No errors

**Step 4: Test retry endpoint**

Run: `npm run start:dev`
Test with: `curl -X POST http://localhost:3000/api/research/retry/test-log-id/test-node-id`
Expected: Returns success/failure response

**Step 5: Commit**

```bash
git add src/research/
git commit -m "feat: add retry API endpoint for failed nodes"
```

### Task 5.2: Implement Frontend Retry Logic

**Files:**
- Modify: `client/src/app/core/services/agent-activity.service.ts`
- Modify: `client/src/app/features/research/components/agent-activity-view/agent-activity-view.ts`

**Step 1: Add retry method to service**

Modify `agent-activity.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AgentActivityService {
  // ... existing code

  constructor(private http: HttpClient) {}

  async retryTask(taskId: string, nodeId: string): Promise<void> {
    if (!this.currentLogId) {
      console.error('No active logId for retry');
      return;
    }

    // Update task status to retrying
    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.id === taskId);
      if (index >= 0) {
        const updated = [...tasks];
        updated[index] = {
          ...updated[index],
          status: 'retrying',
          retryCount: updated[index].retryCount + 1,
        };
        return updated;
      }
      return tasks;
    });

    try {
      // Call retry API
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; message: string }>(
          `${environment.apiUrl}/research/retry/${this.currentLogId}/${nodeId}`,
          {}
        )
      );

      if (!response.success) {
        // Retry failed, update task
        this.activeTasks.update(tasks => {
          const index = tasks.findIndex(t => t.id === taskId);
          if (index >= 0) {
            const updated = [...tasks];
            updated[index] = {
              ...updated[index],
              status: 'error',
              error: {
                message: response.message,
                timestamp: new Date(),
              },
            };
            return updated;
          }
          return tasks;
        });
      }
      // If successful, SSE events will update the task status
    } catch (error: any) {
      // Update task with error
      this.activeTasks.update(tasks => {
        const index = tasks.findIndex(t => t.id === taskId);
        if (index >= 0) {
          const updated = [...tasks];
          updated[index] = {
            ...updated[index],
            status: 'error',
            error: {
              message: error.message || 'Retry request failed',
              timestamp: new Date(),
            },
          };
          return updated;
        }
        return tasks;
      });
    }
  }
}
```

**Step 2: Connect retry button to service**

Modify `agent-activity-view.ts`:

```typescript
onRetryTask(taskId: string): void {
  // Find task to get nodeId
  const task = this.activityService.activeTasks().find(t => t.id === taskId);
  if (task) {
    this.activityService.retryTask(taskId, task.nodeId);
  }
}
```

**Step 3: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 4: Test retry functionality**

Run: `cd client && npm run start`
Trigger an error and click retry button
Expected: Task status changes to "retrying", then completes or errors

**Step 5: Commit**

```bash
git add client/src/app/core/services/agent-activity.service.ts client/src/app/features/research/components/agent-activity-view/
git commit -m "feat: implement retry functionality for failed tasks"
```

---

## Phase 6: Polish & Testing

### Task 6.1: Add Loading Skeletons

**Files:**
- Create: `client/src/app/features/research/components/task-card-skeleton/task-card-skeleton.ts`
- Create: `client/src/app/features/research/components/task-card-skeleton/task-card-skeleton.html`
- Create: `client/src/app/features/research/components/task-card-skeleton/task-card-skeleton.scss`

**Step 1: Create skeleton component**

Create `task-card-skeleton.ts`:

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-task-card-skeleton',
  templateUrl: './task-card-skeleton.html',
  styleUrls: ['./task-card-skeleton.scss']
})
export class TaskCardSkeletonComponent {}
```

**Step 2: Create skeleton template**

Create `task-card-skeleton.html`:

```html
<div class="skeleton-card">
  <div class="skeleton-header">
    <div class="skeleton-icon"></div>
    <div class="skeleton-text skeleton-description"></div>
  </div>
  <div class="skeleton-progress">
    <div class="skeleton-bar"></div>
    <div class="skeleton-text skeleton-percentage"></div>
  </div>
</div>
```

**Step 3: Create skeleton styles**

Create `task-card-skeleton.scss`:

```scss
.skeleton-card {
  padding: 1rem;
  background: white;
  border-radius: 6px;
  border-left: 4px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.skeleton-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.skeleton-icon {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 4px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}

.skeleton-text {
  height: 1rem;
  border-radius: 4px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}

.skeleton-description {
  flex: 1;
  height: 1.25rem;
}

.skeleton-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.skeleton-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}

.skeleton-percentage {
  width: 2.5rem;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

**Step 4: Use skeleton in activity view**

Modify `agent-activity-view.html`:

```html
<!-- Replace loading-message section with: -->
@else {
  <div class="loading-skeletons">
    <app-task-card-skeleton></app-task-card-skeleton>
    <app-task-card-skeleton></app-task-card-skeleton>
    <app-task-card-skeleton></app-task-card-skeleton>
  </div>
}
```

**Step 5: Import skeleton in activity view**

Modify `agent-activity-view.ts`:

```typescript
import { TaskCardSkeletonComponent } from '../task-card-skeleton/task-card-skeleton';

@Component({
  selector: 'app-agent-activity-view',
  imports: [
    CommonModule,
    StageProgressHeaderComponent,
    TaskCardComponent,
    TaskCardSkeletonComponent  // Add this
  ],
  // ... rest
})
```

**Step 6: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 7: Commit**

```bash
git add client/src/app/features/research/components/task-card-skeleton/
git commit -m "feat: add loading skeleton for task cards"
```

### Task 6.2: Add Accessibility Features

**Files:**
- Modify: `client/src/app/features/research/components/task-card/task-card.html`
- Modify: `client/src/app/features/research/components/task-card/task-card.ts`
- Modify: `client/src/app/features/research/components/agent-activity-view/agent-activity-view.html`

**Step 1: Add ARIA attributes to task card**

Modify `task-card.html`:

```html
<div
  class="task-card"
  [ngClass]="getStatusClass()"
  role="status"
  [attr.aria-live]="task().status === 'running' ? 'polite' : 'off'"
  [attr.aria-label]="getAriaLabel()">

  <!-- Rest of template -->
</div>
```

**Step 2: Add aria label helper**

Modify `task-card.ts`:

```typescript
getAriaLabel(): string {
  const task = this.task();
  const status = task.status === 'completed' ? 'complete' : task.status;
  return `${task.description}, ${task.progress} percent ${status}`;
}
```

**Step 3: Add ARIA live region to activity view**

Modify `agent-activity-view.html`:

```html
<div
  class="agent-activity-container"
  role="main"
  aria-label="Research agent activity">

  <!-- Add announcer for screen readers -->
  <div
    class="sr-only"
    role="status"
    aria-live="polite"
    aria-atomic="true">
    @if (activityService.currentStage()) {
      Stage {{ activityService.currentStage() }} of 3,
      {{ activityService.stageProgress() }} percent complete
    }
  </div>

  <!-- Rest of template -->
</div>
```

**Step 4: Add sr-only class to global styles**

Modify `client/src/styles.scss`:

```scss
// Screen reader only class
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

**Step 5: Add keyboard navigation to retry button**

Modify `task-card.html` retry button:

```html
<button
  class="retry-button"
  (click)="onRetry()"
  (keydown.enter)="onRetry()"
  (keydown.space)="onRetry(); $event.preventDefault()"
  aria-label="Retry failed task">
  ↻ Retry
</button>
```

**Step 6: Verify TypeScript compilation**

Run: `cd client && npm run build`
Expected: No errors

**Step 7: Test accessibility**

Use browser accessibility tools or screen reader
Expected: Proper announcements and keyboard navigation

**Step 8: Commit**

```bash
git add client/src/app/features/research/components/ client/src/styles.scss
git commit -m "feat: add accessibility features (ARIA, keyboard nav, screen reader)"
```

### Task 6.3: Add Responsive Styles

**Files:**
- Modify: `client/src/app/features/research/components/agent-activity-view/agent-activity-view.scss`
- Modify: `client/src/app/features/research/components/stage-progress-header/stage-progress-header.scss`
- Modify: `client/src/app/features/research/components/task-card/task-card.scss`

**Step 1: Add mobile styles to activity view**

Modify `agent-activity-view.scss`:

```scss
// Add at end of file:

@media (max-width: 768px) {
  .agent-activity-container {
    padding: 1rem;
  }

  .section-title {
    font-size: 1rem;
  }

  .tasks-list {
    gap: 0.5rem;
  }

  .completion-message,
  .loading-message {
    padding: 1.5rem 1rem;
    font-size: 0.9375rem;
  }

  .completion-icon,
  .loading-icon {
    font-size: 1.5rem;
  }
}

@media (max-width: 480px) {
  .agent-activity-container {
    padding: 0.75rem;
  }

  .tasks-section {
    margin-bottom: 1.5rem;
  }
}
```

**Step 2: Add mobile styles to stage header**

Modify `stage-progress-header.scss`:

```scss
// Add at end of file:

@media (max-width: 768px) {
  .stage-header {
    padding: 1rem;
  }

  .stage-title {
    font-size: 1rem;
  }

  .stage-icon {
    font-size: 1.25rem;
  }

  .progress-text {
    min-width: 2.5rem;
    font-size: 0.8125rem;
  }
}

@media (max-width: 480px) {
  .stage-header {
    padding: 0.75rem;
  }

  .stage-info {
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .stage-title {
    font-size: 0.9375rem;
  }
}
```

**Step 3: Add mobile styles to task card**

Modify `task-card.scss`:

```scss
// Add at end of file:

@media (max-width: 768px) {
  .task-card {
    padding: 0.75rem;
  }

  .task-description {
    font-size: 0.875rem;
  }

  .retry-button {
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
  }

  .error-message {
    padding: 0.375rem;
    margin-top: 0.5rem;
  }

  .error-text {
    font-size: 0.8125rem;
  }
}

@media (max-width: 480px) {
  .task-header {
    gap: 0.5rem;
  }

  .status-icon {
    font-size: 1rem;
  }

  .task-description {
    font-size: 0.8125rem;
  }

  .progress-percentage {
    font-size: 0.75rem;
    min-width: 2rem;
  }
}
```

**Step 4: Test responsive design**

Run: `cd client && npm run start`
Test at different viewport sizes: 1200px, 768px, 480px
Expected: Layout adapts smoothly to all sizes

**Step 5: Commit**

```bash
git add client/src/app/features/research/components/
git commit -m "feat: add responsive styles for mobile and tablet"
```

### Task 6.4: Final Testing & Documentation

**Files:**
- Create: `docs/AGENT_ACTIVITY_UI.md`
- Modify: `README.md`

**Step 1: Create feature documentation**

Create `docs/AGENT_ACTIVITY_UI.md`:

```markdown
# Agent Activity Real-Time UI

## Overview

The Agent Activity UI provides real-time visibility into research execution with granular task progress, error handling, and retry capabilities.

## Features

- **Real-time Progress**: SSE-based streaming shows live agent activity
- **Granular Visibility**: Stages, tools, and milestone-level detail
- **Error Resilience**: Displays errors while continuing parallel tasks
- **Retry Capability**: One-click retry for failed tasks
- **Simple History**: Chat-like history with expand/collapse
- **Accessibility**: WCAG AA compliant with screen reader support
- **Responsive**: Mobile-first design adapts to all screen sizes

## Architecture

### Backend
- `ResearchLogger` emits milestone events via SSE
- Predefined milestone templates with dynamic data
- Comprehensive logging to existing framework
- Retry API endpoint for failed nodes

### Frontend
- `AgentActivityService` manages SSE connection
- Angular signals for reactive state
- Component hierarchy: StageHeader → TasksList → TaskCards
- History integrates with existing LogsService

## Usage

### Starting Research

When user submits a query:
1. Backend returns `logId`
2. `AgentActivityView` subscribes to SSE stream
3. Real-time updates populate UI
4. Answer appears below activity when complete

### Viewing History

- History shows below answer
- Click query to expand/collapse full answer
- "View details" navigates to logs page for debugging

### Handling Errors

- Failed tasks show error message and retry button
- Parallel tasks continue execution
- Click retry to re-execute specific node
- Status updates in real-time

## Development

### Running Locally

```bash
# Backend
npm run start:dev

# Frontend
cd client && npm run start
```

### Testing

Submit a test query and verify:
- [ ] SSE connection establishes
- [ ] Tasks appear with progress
- [ ] Stage transitions work
- [ ] Completion shows answer
- [ ] History appears and expands
- [ ] Errors show retry button
- [ ] Retry functionality works
- [ ] Responsive design adapts
- [ ] Screen reader announces updates

### Debug Logs Page

For technical details, navigate to `/logs/:logId`:
- Full timeline visualization
- Execution graph
- Complete log entries
- Performance metrics

## Troubleshooting

**SSE not connecting:**
- Check backend is running
- Verify CORS configuration
- Check browser console for errors

**No tasks appearing:**
- Verify milestone events are emitted
- Check SSE stream in Network tab
- Ensure logId is correct

**Retry not working:**
- Check retry API endpoint
- Verify nodeId is valid
- Check backend logs for errors

## Future Enhancements

- Real-time token usage display
- Cost estimation
- Agent collaboration visualization
- Export research report
- Comparison mode for multiple queries
```

**Step 2: Update main README**

Modify `README.md` to add section:

```markdown
## Features

### Agent Activity Real-Time UI

Real-time visibility into research execution with:
- Live progress updates via Server-Sent Events
- Granular task-level detail (stages, tools, milestones)
- Error handling with retry capability
- Simple chat-like history
- Responsive, accessible design

See [Agent Activity UI Documentation](docs/AGENT_ACTIVITY_UI.md) for details.
```

**Step 3: Run full integration test**

```bash
# Start backend
npm run start:dev

# In another terminal, start frontend
cd client && npm run start

# Test checklist:
# 1. Submit query
# 2. Verify agent activity appears
# 3. Watch real-time progress
# 4. Check answer appears
# 5. Verify history shows
# 6. Expand history item
# 7. Click "View details" → logs page
# 8. Test retry on error (if available)
# 9. Test on mobile viewport
# 10. Test with screen reader
```

**Step 4: Commit documentation**

```bash
git add docs/AGENT_ACTIVITY_UI.md README.md
git commit -m "docs: add agent activity UI documentation"
```

**Step 5: Push all changes**

```bash
git push origin master
```

---

## Completion Checklist

- [ ] Phase 1: Backend Foundation (5 tasks)
  - [ ] Milestone event types created
  - [ ] Template configurations defined
  - [ ] ResearchLogger enhanced
  - [ ] Pipeline executor integrated
  - [ ] All stages emit milestones

- [ ] Phase 2: Frontend Service (3 tasks)
  - [ ] Activity task model created
  - [ ] AgentActivityService created
  - [ ] Event handlers implemented

- [ ] Phase 3: UI Components (4 tasks)
  - [ ] Stage progress header created
  - [ ] Task card component created
  - [ ] Agent activity view created
  - [ ] Integrated into research component

- [ ] Phase 4: History Integration (2 tasks)
  - [ ] History component created
  - [ ] Integrated into research page

- [ ] Phase 5: Error Handling & Retry (2 tasks)
  - [ ] Retry API endpoint created
  - [ ] Frontend retry logic implemented

- [ ] Phase 6: Polish & Testing (4 tasks)
  - [ ] Loading skeletons added
  - [ ] Accessibility features added
  - [ ] Responsive styles added
  - [ ] Documentation created and tests passed

## Implementation Complete! 🎉

The agent activity real-time UI is now fully implemented with:
- ✅ Real-time SSE streaming
- ✅ Granular milestone tracking
- ✅ Error handling and retry
- ✅ Simple history integration
- ✅ Responsive, accessible design
- ✅ Comprehensive documentation
