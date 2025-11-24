# Agent Activity Real-Time UI Design

**Date:** 2025-01-24
**Status:** Approved
**Purpose:** Design a real-time agent activity view for the research interface

## Overview

Users need visibility into the research process. This design creates a real-time interface showing active agent tasks, progress, and results. The interface replaces the screen during execution, shows the answer when complete, and maintains a simple history of past queries.

## Key Requirements

1. **Full-screen focus** - Agent activity replaces the entire research page during execution
2. **Real-time updates** - SSE streams progress from backend
3. **Granular visibility** - Shows stages, tools, and detailed milestones
4. **Error resilience** - Displays errors but continues parallel tasks; provides retry
5. **Answer preservation** - Answer appears below activity when complete
6. **Simple history** - Shows past queries and answers in chat-like format
7. **Debug separation** - Logs page handles technical details; research page handles user experience

## Architecture

### Data Flow

```
User submits query
  ↓
Backend returns logId
  ↓
AgentActivityView subscribes to SSE stream
  ↓
Events update UI in real-time:
  - Stage transitions
  - Tool executions
  - Milestone progress
  ↓
Answer appears below activity on completion
  ↓
System logs all events to existing logging framework
```

### Component Hierarchy

```
AgentActivityView (main container)
├── StageProgressHeader
│   ├── Current stage indicator (e.g., "Stage 1 of 3")
│   └── Overall progress bar
├── ActiveTasksList
│   └── TaskCard[] (repeatable)
│       ├── Task description (template + dynamic data)
│       ├── Progress bar with percentage
│       ├── Status indicator
│       └── Retry button (on error)
├── CompletedTasksCollapse (optional)
│   └── Condensed view of finished tasks
├── AnswerCard (appears on completion)
│   ├── Research answer
│   └── Sources list
└── ResearchHistory
    └── HistoryItem[] (collapsible)
        ├── Query text
        ├── Answer preview
        ├── Timestamp
        └── Debug link (to logs page)
```

## Data Model

### Activity Task

```typescript
interface ActivityTask {
  id: string;
  nodeId: string;
  stage: 1 | 2 | 3;
  type: 'stage' | 'tool' | 'milestone';
  description: string;
  progress: number;  // 0-100
  status: 'pending' | 'running' | 'completed' | 'error' | 'retrying';
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
```

### Milestone Event

```typescript
interface MilestoneEvent extends NodeLifecycleEvent {
  event: 'milestone';
  milestone: {
    id: string;
    stage: 1 | 2 | 3;
    template: string;  // e.g., "Searching {count} databases: {sources}"
    data: Record<string, any>;  // {count: 25, sources: "NASA, arXiv"}
    progress: number;
    status: 'pending' | 'running' | 'completed';
  };
}
```

## Backend Enhancements

### Predefined Milestone Templates

**Stage 1: Query Analysis & Search**
- "Deconstructing query into core topics" (20%)
- "Identifying key terms: {terms}" (40%)
- "Searching {count} databases: {sources}" (70%)
- "Filtering results for credibility" (90%)

**Stage 2: Content Fetch**
- "Fetching {count} relevant sources" (30%)
- "Extracting content from {url}" (per source: 10-90%)
- "Validating content quality" (95%)

**Stage 3: Synthesis**
- "Analyzing {count} sources" (20%)
- "Synthesizing key findings" (50%)
- "Generating comprehensive answer" (80%)
- "Formatting final response" (95%)

### Logging Requirements

The backend must log every event:

```typescript
// Log all these via ResearchLogger
interface LoggableEvents {
  stage_start: { stage: number, name: string }
  stage_complete: { stage: number, duration: number }
  milestone_start: { milestoneId: string, stage: number, template: string, data: any }
  milestone_progress: { milestoneId: string, progress: number }
  milestone_complete: { milestoneId: string, duration: number }
  tool_start: { tool: string, input: any }
  tool_complete: { tool: string, output: any }
  error: { nodeId: string, error: Error, context: any, recoverable: boolean }
}
```

### SSE Event Types

The backend streams these events:

- `node-start` - New task begins
- `node-milestone` - Milestone update with template and data
- `node-progress` - Progress percentage update
- `node-complete` - Task completes
- `node-error` - Task fails

## Frontend Implementation

### New Service: AgentActivityService

```typescript
@Injectable({ providedIn: 'root' })
export class AgentActivityService {
  // Signals
  currentStage = signal<number>(1);
  activeTasks = signal<ActivityTask[]>([]);
  completedTasks = signal<ActivityTask[]>([]);
  stageProgress = signal<number>(0);
  isComplete = signal<boolean>(false);

  private eventSource: EventSource | null = null;

  connectToStream(logId: string): void {
    const url = `${environment.apiUrl}/research/stream/events/${logId}`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('node-start', (e) =>
      this.handleTaskStart(JSON.parse(e.data))
    );
    this.eventSource.addEventListener('node-milestone', (e) =>
      this.handleMilestone(JSON.parse(e.data))
    );
    this.eventSource.addEventListener('node-progress', (e) =>
      this.handleProgress(JSON.parse(e.data))
    );
    this.eventSource.addEventListener('node-complete', (e) =>
      this.handleTaskComplete(JSON.parse(e.data))
    );
    this.eventSource.addEventListener('node-error', (e) =>
      this.handleTaskError(JSON.parse(e.data))
    );
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
```

### Event Processing

**Task Start:**
- Creates new `ActivityTask` object
- Adds to `activeTasks` signal
- UI renders new task card

**Milestone Update:**
- Finds task by nodeId
- Updates description using template + data
- Updates progress percentage
- Renders template: "Searching {count} databases: {sources}" → "Searching 25 databases: NASA, arXiv"

**Task Complete:**
- Moves task from `activeTasks` to `completedTasks`
- Calculates stage progress
- Triggers completion animation

**Task Error:**
- Updates task status to 'error'
- Stores error details
- Shows retry button if `canRetry` is true
- Continues processing other tasks

### Progress Calculation

```typescript
// Stage progress = completed tasks / total tasks * 100
// Each stage contributes to overall progress
overallProgress = (stage1 * 0.33) + (stage2 * 0.33) + (stage3 * 0.34)
```

## Error Handling & Retry

### Error Display

When a task fails:
- Task card shows red accent border
- Red progress bar indicates failure point
- Error icon replaces spinner
- Error message appears in tooltip
- Retry button shows if task supports retry

### Parallel Task Continuation

Tasks run independently when possible:
- Multiple web fetches run in parallel
- If Task A fails, Tasks B and C continue
- Stage proceeds if minimum required tasks complete
- Dependent tasks wait for prerequisites

### Retry Mechanism

**Single Task Retry:**
```
User clicks retry button
  ↓
POST /research/retry/:logId/:nodeId
  ↓
Backend re-executes specific node
  ↓
Task status changes to 'retrying'
  ↓
SSE streams new execution events
  ↓
Success or failure (max 3 retries)
```

**Whole Query Retry:**
- Button appears if critical failures occur
- Submits fresh query with same parameters
- Generates new logId and execution

## Research History

### Display Format

The history section appears below the answer card:

```
┌─ Research History ──────────────────────┐
│                                          │
│ ▼ What are black holes?                 │
│   Black holes are regions of spacetime  │
│   where gravity is so strong...         │
│   2 hours ago • View details            │
│                                          │
│ ▶ Previous question text                │
│   Yesterday • View details              │
└──────────────────────────────────────────┘
```

### Behavior

- Collapsed by default (click chevron to expand)
- Expansion shows full answer inline
- "View details" link navigates to `/logs/:logId`
- Uses existing `LogsService.sessions()` for data
- Shows most recent 20 queries
- Stores in localStorage for quick access

### Integration with Logs

The logs page handles technical details:
- Full timeline visualization
- Execution graph
- Complete log entries
- Debug information

The research page handles user experience:
- Simple question/answer history
- No technical details
- Clean, chat-like interface

## Visual Design

### Task Card States

**Pending:**
- Gray background
- Clock icon
- No progress bar

**Running:**
- Blue accent color
- Animated progress bar
- Spinner icon

**Completed:**
- Green checkmark icon
- 100% progress bar (green)
- Fade to condensed view

**Error:**
- Red accent border
- Red progress bar
- Error icon
- Retry button

**Retrying:**
- Yellow accent
- Pulsing animation
- Circular arrow icon

### Icons

- 🔍 Search operations
- 🌐 Web fetches
- 📊 Data filtering
- 🤖 LLM processing
- ✓ Completed
- ⚠️ Error
- ↻ Retrying

### Animations

```scss
// Task card entrance
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

// Completion pulse
@keyframes completePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

// Error shake
@keyframes errorShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

// Progress bar fill
.progress-fill {
  transition: width 0.5s ease-in-out;
}
```

## Responsive Design

**Desktop (>1024px):**
- Two-column task grid
- Sidebar for history
- Larger progress bars

**Tablet (768-1024px):**
- Single column tasks
- Full-width layout
- Touch-friendly buttons

**Mobile (<768px):**
- Compact card design
- Smaller progress bars
- Touch-optimized retry buttons
- Stacked layout

## Performance

### Optimizations

- Batch SSE updates every 100ms to reduce redraws
- Use CSS containment for animation performance
- Virtual scrolling for 50+ tasks
- Debounced history loading
- Lazy load historical data

### Loading States

- Skeleton cards with shimmer effect during connection
- "Connecting to research agent..." message
- Reconnection toast if SSE drops
- "Still working..." if no events for 30 seconds

## Accessibility

- ARIA live regions announce task completion
- Keyboard navigation for all interactive elements
- Screen reader descriptions for progress states
- Focus management when answer appears
- High contrast mode support
- Sufficient color contrast ratios (WCAG AA)

## Edge Cases

**Long queries:**
- Truncate in history list
- Show full text on expansion

**Network disconnect:**
- Save current state
- Auto-reconnect SSE
- Resume from last known state

**Browser refresh:**
- Reconnect to existing logId if still running
- Show "Reconnecting..." state

**Empty history:**
- Show friendly onboarding message
- Prompt user to ask first question

**Very slow tasks:**
- Show "Still working..." after 30s
- Provide context about long operations

## Implementation Phases

### Phase 1: Backend Foundation
1. Add milestone event types to ResearchLogger
2. Implement milestone templates for each stage
3. Emit milestone events at key points in pipeline
4. Ensure all events persist to logging framework
5. Test SSE streaming with milestone events

### Phase 2: Frontend Service
1. Create AgentActivityService
2. Implement SSE connection management
3. Add event processing logic
4. Build reactive state with signals
5. Add error handling and reconnection

### Phase 3: UI Components
1. Build StageProgressHeader component
2. Create TaskCard component with all states
3. Implement ActiveTasksList container
4. Add AnswerCard integration
5. Style with animations and responsive design

### Phase 4: History Integration
1. Connect to existing LogsService
2. Build ResearchHistory component
3. Implement expand/collapse behavior
4. Add "View details" navigation to logs page
5. Test localStorage persistence

### Phase 5: Error Handling & Retry
1. Implement retry API endpoint
2. Add retry button to TaskCard
3. Build retry state management
4. Add error tooltips and messaging
5. Test parallel task continuation

### Phase 6: Polish & Testing
1. Add animations and transitions
2. Implement accessibility features
3. Test responsive design
4. Performance optimization
5. Cross-browser testing
6. User acceptance testing

## Success Metrics

- Users see real-time progress during research
- All backend events log correctly
- Error states display clearly with retry options
- History provides quick access to past queries
- Logs page remains available for debugging
- SSE connections handle network issues gracefully
- UI responds smoothly to rapid updates
- Accessibility standards met (WCAG AA)

## Open Questions

None - design validated and ready for implementation.
