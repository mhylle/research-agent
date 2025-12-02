# End-to-End Browser Test Report: Agentic Planning System
**Date**: 2025-11-24
**Branch**: `feature/agentic-planning-system`
**Tester**: Claude (Automated Browser Testing via Playwright MCP)

---

## Executive Summary

❌ **CRITICAL ISSUE**: The agentic planning system code exists in the codebase but **IS NOT RUNNING**. The old 3-stage hardcoded pipeline is still executing instead.

---

## Test Environment

- **Backend**: Running on `localhost:3000` (started: Nov 23)
- **Frontend**: Running on `localhost:4200` (Angular dev server)
- **Database**: SQLite at `/home/mhylle/projects/research_agent/data/research.db`
- **Test Query**: "What is quantum computing?"
- **Test Session ID**: `96ff5040-ddf2-418b-97d5-d69889307b28`

---

## Test Results

### 1. Frontend Integration ✅
**Status**: PASSED - Frontend is properly set up for SSE streaming

**Evidence**:
- `AgentActivityViewComponent` correctly connects to SSE stream via `AgentActivityService`
- Service listens for events: `node-start`, `node-milestone`, `node-progress`, `node-complete`, `node-error`
- SSE endpoint URL: `${environment.apiUrl}/research/stream/events/${logId}`
- Real-time task display with progress tracking implemented

**Issue**: ⚠️ SSE endpoint URL mismatch
- Frontend expects: `/api/research/stream/events/:logId`
- Backend provides: `/api/research/stream/:logId`

### 2. Backend Orchestrator ✅
**Status**: PASSED - Orchestrator code exists and is wired up

**Evidence**:
- `Orchestrator` service exists at `/src/orchestration/orchestrator.service.ts`
- `ResearchService` correctly delegates to `Orchestrator`
- `PlannerService` exists for dynamic planning
- Event emission logic is in place (`session_started`, `plan_created`, `phase_started`, etc.)

### 3. Agentic Planning Execution ❌
**Status**: **FAILED** - Old 3-stage pipeline still running

**Expected Behavior**:
```
session_started → plan_created → phase_added (dynamic) → phase_started →
step_started → step_completed → phase_completed → session_completed
```

**Actual Behavior**:
```
stage-1 (hardcoded) → stage-2 (hardcoded) → stage-3 (hardcoded)
```

**Log Evidence**:
```json
{"message":"Node started","nodeId":"stage-1","nodeType":"stage"}
{"message":"Stage input","operation":"stage_input","stage":1}
{"message":"Stage output","operation":"stage_output","stage":1}
{"message":"Node started","nodeId":"stage-2","nodeType":"stage"}
```

**NO PLANNING EVENTS EMITTED**:
- ❌ No `session_started`
- ❌ No `plan_created`
- ❌ No `phase_added`
- ❌ No `phase_started`
- ❌ No `step_started`

### 4. Frontend Display ❌
**Status**: FAILED - Shows generic 3 stages instead of dynamic phases

**What's Displayed**:
1. "Query Analysis & Search" (6s)
2. "Content Fetch & Selection" (15s)
3. "Synthesis & Answer Generation" (33s)

**What Should Be Displayed**:
- Dynamic phase names from planner
- Individual step progress within each phase
- Real-time updates as steps execute
- Replan checkpoints when triggered

**Screenshots**:
- ✅ `initial-page.png` - Landing page loaded correctly
- ✅ `research-in-progress.png` - Generic "Stage 1 of 3" shown
- ✅ `logs-page.png` - Timeline view with hardcoded phases
- ✅ `phase-expanded.png` - Old stage input/output structure

---

## Root Cause Analysis

### Problem Chain:
1. **Orchestrator exists** but is not configured to use PlannerService
2. **Old pipeline code** (`PipelineExecutor` or similar) is still being called
3. **Frontend gets old events** from the legacy system
4. **Display logic** falls back to showing hardcoded stage names

### Evidence of Old System Running:
```javascript
// From logs - OLD system structure
{"component":"pipeline","operation":"stage_input","stage":1}
{"component":"pipeline","operation":"stage_output","stage":1}
```

### What's Missing:
- Integration point between `Orchestrator` and `PlannerService`
- Execution of dynamic phases instead of hardcoded stages
- Event emission from the orchestrator's execution loop

---

## Detailed Findings

### Finding 1: SSE Endpoint Mismatch
**Severity**: Medium
**Location**: `/client/src/app/core/services/agent-activity.service.ts:35`

Frontend expects:
```typescript
const url = `${environment.apiUrl}/research/stream/events/${logId}`;
```

Backend provides:
```typescript
@Sse('stream/:logId') // translates to /research/stream/:logId
```

**Fix Required**: Change frontend URL or add alias endpoint

### Finding 2: Orchestrator Not Calling Planner
**Severity**: **CRITICAL**
**Location**: `/src/orchestration/orchestrator.service.ts`

The `Orchestrator.executeResearch()` method exists and has planner logic, but it's not being invoked. The old 3-stage pipeline is executing instead.

**Investigation Needed**:
- Check if there's a `PipelineExecutor` or similar service still active
- Verify the call chain from `ResearchController` → `ResearchService` → `Orchestrator`
- Check for any conditional logic that might be routing to old code path

### Finding 3: Frontend Event Handlers Ready But Unused
**Severity**: Low (dependent on backend fix)
**Location**: `/client/src/app/core/services/agent-activity.service.ts`

Event handlers are implemented for all planning events but never receive them:
- `handleTaskStart()`
- `handleMilestone()`
- `handleProgress()`
- `handleTaskComplete()`
- `handleTaskError()`

---

## Recommendations

### Immediate Actions (Priority 1):
1. **Debug orchestrator execution path**
   - Add console logging to `Orchestrator.executeResearch()`
   - Verify it's actually being called
   - Check if there's a separate "old" pipeline executor still active

2. **Verify planner service integration**
   - Check if `plannerService.createPlan()` is being called
   - Verify plan creation logic is working
   - Test phase generation manually

3. **Fix SSE endpoint mismatch**
   - Either update frontend URL to `/api/research/stream/:logId`
   - Or add backend route alias for `/api/research/stream/events/:logId`

### Next Steps (Priority 2):
4. **Integration testing**
   - Unit test the orchestrator with mocked planner
   - Verify event emission from orchestrator
   - Test SSE stream with real events

5. **Database verification**
   - Check if `log_entries` table is receiving planning events
   - Verify `LogService` is persisting correct event types

### Future Improvements (Priority 3):
6. **Frontend enhancements**
   - Add error state handling for SSE connection failures
   - Implement reconnection logic
   - Add loading states for phase transitions

---

## Test Artifacts

### Screenshots Captured:
1. `/home/mhylle/projects/research_agent/.playwright-mcp/initial-page.png`
   - Landing page with research history

2. `/home/mhylle/projects/research_agent/.playwright-mcp/research-in-progress.png`
   - Research executing with "Stage 1 of 3" display

3. `/home/mhylle/projects/research_agent/.playwright-mcp/logs-page.png`
   - Timeline view showing 3 hardcoded phases

4. `/home/mhylle/projects/research_agent/.playwright-mcp/phase-expanded.png`
   - Expanded phase showing old input/output structure

### Log Excerpts:
See `/home/mhylle/projects/research_agent/logs/research-combined.log`
- Session: `96ff5040-ddf2-418b-97d5-d69889307b28`
- Timestamp: 2025-11-24T21:26:28.245Z

---

## Conclusion

The agentic planning system has been **implemented in code** but is **NOT running in the application**. The old 3-stage hardcoded pipeline is still active and processing all research queries.

**Primary Issue**: There is a disconnect between the `Orchestrator` service (which contains the new planning logic) and the actual execution path. The system is still routing through the old pipeline instead of the new agentic orchestrator.

**Resolution Required**:
- Identify where the old pipeline is being invoked
- Ensure `ResearchService` → `Orchestrator` → `PlannerService` execution path is active
- Remove or disable the old 3-stage pipeline code
- Verify events are emitted and reach the frontend via SSE

**Status**: ❌ **NOT PRODUCTION READY** - Requires backend execution path fix before deployment.
