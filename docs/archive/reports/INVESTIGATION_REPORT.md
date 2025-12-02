# Investigation Report: Research Session 7c4e4ace-7210-4d54-b9c0-903c210666f7

## Executive Summary

**Finding:** Data IS being logged correctly in the backend. The issue is that the frontend is NOT displaying the input/output data that is available in the database.

## Investigation Details

### 1. Database Analysis

**Database Location:** `/home/mnh/projects/research-agent/data/logs/research.db`

**Total Log Entries:** 29 entries for this research session

**Event Type Breakdown:**
- session_started: 1
- planning_started: 1
- planning_iteration: 11
- phase_added: 2
- step_added: 2
- plan_created: 1
- phase_started: 2
- step_started: 2
- **step_completed: 2** ← KEY FINDING
- phase_completed: 2
- replan_triggered: 1
- replan_completed: 1
- session_completed: 1 (likely)

### 2. Critical Finding: Input/Output Data EXISTS in Database

#### Step 1: tavily_search (StepId: 9b3d8c31-3156-4e2e-9243-11a28e3246b9)

**Event:** step_completed
**Timestamp:** 2025-11-26 14:10:15.107

**DATA LOGGED:**
```json
{
  "stepId": "9b3d8c31-3156-4e2e-9243-11a28e3246b9",
  "toolName": "tavily_search",
  "input": {
    "query": "antimatter trendsetters"
  },
  "output": [
    {
      "title": "didn't warn u❤️‍   - Instagram",
      "url": "https://www.instagram.com/reel/CkVmsLpJmbG/",
      "content": "...",
      "score": 0.6202772
    },
    // ... 4 more search results
  ],
  "durationMs": 632,
  "metadata": {
    "toolName": "tavily_search",
    "inputConfig": {
      "query": "antimatter trendsetters"
    }
  }
}
```

✅ **Input field:** PRESENT
✅ **Output field:** PRESENT with 5 search results
✅ **Metadata:** PRESENT

#### Step 2: synthesize (StepId: 74cbf92f-0f9b-4eb8-b6ea-c34ed211ce96)

**Event:** step_completed
**Timestamp:** 2025-11-26 14:10:35.982

**DATA LOGGED:**
```json
{
  "stepId": "74cbf92f-0f9b-4eb8-b6ea-c34ed211ce96",
  "toolName": "synthesize",
  "input": {
    "query": "What are the latest news about antimatter?...",
    "context": "## Search Results\n\n[5 search results...]",
    "systemPrompt": "You are a research synthesis assistant...",
    "prompt": "Based on the research query..."
  },
  "output": "Based on the search results, it appears that the term \"antimatter\" is being used in various contexts...",
  "durationMs": 18728,
  "metadata": {
    "toolName": "synthesize",
    "inputConfig": { /* ... */ }
  }
}
```

✅ **Input field:** PRESENT with full context
✅ **Output field:** PRESENT with full synthesis answer
✅ **Metadata:** PRESENT

### 3. Backend Logging Code Analysis

**File:** `/home/mnh/projects/research-agent/src/orchestration/orchestrator.service.ts`
**Lines:** 307-321

```typescript
await this.emit(
  logId,
  'step_completed',
  {
    stepId: step.id,
    toolName: step.toolName,
    input: step.config,           // ✅ INPUT IS LOGGED
    output: result.output,        // ✅ OUTPUT IS LOGGED
    tokensUsed: result.tokensUsed,
    durationMs,
    metadata: result.metadata,
  },
  undefined,
  step.id,
);
```

**Confirmation:** Backend IS logging both input and output correctly.

### 4. Frontend Display Analysis

**File:** `/home/mnh/projects/research-agent/client/src/app/core/services/agent-activity.service.ts`
**Lines:** 415-437

```typescript
private handleStepCompleted(event: any): void {
  const { stepId, toolName, durationMs } = event;

  this.activeTasks.update(tasks => {
    const index = tasks.findIndex(t => t.id === stepId);
    if (index >= 0) {
      const completedTask = {
        ...tasks[index],
        description: `Completed: ${toolName} (${durationMs}ms)`,  // ❌ ONLY shows toolName
        status: 'completed' as TaskStatus,
        progress: 100,
      };
      // ...
    }
  });
}
```

**Problem Identified:** The frontend receives the `step_completed` event with input/output data, but it ONLY extracts:
- stepId
- toolName
- durationMs

The input and output fields are in the event but are NOT being extracted or stored in the ActivityTask.

**File:** `/home/mnh/projects/research-agent/client/src/app/features/research/components/task-card/task-card.component.html`

The task card component displays:
- task().description (which only contains "Completed: toolName (duration)")
- task().timestamp
- task().duration
- task().progress
- task().status

**No fields for input/output data exist in the task card template.**

### 5. Root Cause Analysis

#### Data Flow:
1. **Backend (Orchestrator)** → ✅ Logs input/output to database
2. **Backend (SSE Stream)** → ✅ Sends input/output in step_completed event
3. **Frontend (AgentActivityService)** → ❌ IGNORES input/output fields
4. **Frontend (TaskCard)** → ❌ Has no UI to display input/output
5. **Database (SQLite)** → ✅ Contains full input/output data

#### The Gap:
The data exists in:
- ✅ Database
- ✅ SSE events

But is NOT used by:
- ❌ Frontend service (doesn't extract it)
- ❌ Frontend UI (doesn't display it)

### 6. What's Missing from Frontend

#### A. ActivityTask Model
**File:** Likely in `/home/mnh/projects/research-agent/client/src/app/models/activity-task.model.ts`

The ActivityTask interface needs:
```typescript
export interface ActivityTask {
  // ... existing fields ...
  input?: any;      // ← MISSING
  output?: any;     // ← MISSING
  metadata?: any;   // ← MISSING
}
```

#### B. AgentActivityService.handleStepCompleted()
Needs to extract and store:
```typescript
const { stepId, toolName, durationMs, input, output, metadata } = event;
```

#### C. Task Card Component
Needs UI elements to display:
- Input data (expandable/collapsible)
- Output data (expandable/collapsible)
- Metadata (optional)

### 7. Verification

To verify the data exists in the database, I ran:

```bash
node investigate-correct-db.js
```

**Result:** Confirmed that both step_completed events contain full input/output data.

### 8. Conclusion

**Is the problem in logging (backend)?** NO ✅
**Is the problem in display (frontend)?** YES ❌

**The backend is logging everything correctly.** The frontend simply needs to:
1. Extract the input/output fields from SSE events
2. Store them in the ActivityTask objects
3. Display them in the task card UI

### 9. Additional Findings

#### Database Path Discrepancy
- **Configured path:** `./data/logs/research.db`
- **Actual working database:** `/home/mnh/projects/research-agent/data/logs/research.db` (700KB)
- **Empty database found:** `/home/mnh/projects/research-agent/data/research.db` (0 bytes)

The correct database is being used by the application.

#### Research Results Table
The investigation script also checked for research_results entries for this logId. This would contain the final synthesized answer, sources, and metadata. (Output was truncated in the terminal, would need to query separately if needed.)

## Recommendations

### Immediate Fix (Frontend Only)
1. Update ActivityTask model to include input, output, and metadata fields
2. Modify handleStepCompleted() to extract these fields from events
3. Add expandable sections to task-card component to display input/output
4. Consider formatting based on data type (JSON, text, array, etc.)

### Future Enhancements
1. Add syntax highlighting for JSON data
2. Add search/filter within input/output data
3. Add copy-to-clipboard functionality
4. Add ability to download step data as JSON
5. Consider pagination for large outputs

## Files Referenced

### Backend
- `/home/mnh/projects/research-agent/src/orchestration/orchestrator.service.ts`
- `/home/mnh/projects/research-agent/src/logging/log.service.ts`
- `/home/mnh/projects/research-agent/src/logging/entities/log-entry.entity.ts`
- `/home/mnh/projects/research-agent/src/research/entities/research-result.entity.ts`
- `/home/mnh/projects/research-agent/src/app.module.ts`

### Frontend
- `/home/mnh/projects/research-agent/client/src/app/core/services/agent-activity.service.ts`
- `/home/mnh/projects/research-agent/client/src/app/features/research/components/agent-activity-view/agent-activity-view.component.html`
- `/home/mnh/projects/research-agent/client/src/app/features/research/components/task-card/task-card.component.ts`
- `/home/mnh/projects/research-agent/client/src/app/features/research/components/task-card/task-card.component.html`

### Database
- `/home/mnh/projects/research-agent/data/logs/research.db` (700KB, ACTIVE)
- `/home/mnh/projects/research-agent/data/research.db` (0 bytes, EMPTY)

---

**Investigation Completed:** 2025-11-26
**Investigator:** Claude Code
**Research ID:** 7c4e4ace-7210-4d54-b9c0-903c210666f7
**Status:** ✅ Root cause identified (Frontend display issue, NOT backend logging issue)
