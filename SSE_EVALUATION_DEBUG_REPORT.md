# SSE Evaluation Events Debug Report

## Problem Statement
Backend logs confirm evaluation events are received:
- `[SSE] Received event for <logId>: evaluation_started`
- `[SSE] Received event for <logId>: evaluation_completed`

But frontend never receives these events (no debug logs in browser console).

## Investigation Findings

### 1. Backend SSE Controller Analysis
**File**: `src/research/research-stream.controller.ts`

**Event Emission Path**:
```typescript
// Orchestrator emits event
this.eventEmitter.emit(`log.${logId}`, entry);  // Line 674

// SSE Controller listens
this.eventEmitter.on(`log.${logId}`, listener);  // Line 64

// Listener transforms and sends
const uiEvent = this.transformToUIEvent(entry);
subscriber.next({
  data: JSON.stringify(uiEvent),
  type: entry.eventType,  // "evaluation_started" or "evaluation_completed"
  id: entry.id
} as MessageEvent);
```

**Transformation Logic**:
- Lines 324-345: `evaluation_started`, `evaluation_completed`, `evaluation_failed` are handled
- Returns proper UIEvent with title, description, status, phase, scores, etc.
- No filtering or exclusion of evaluation events

✅ **Backend code is correct**

### 2. Frontend SSE Listener Analysis
**File**: `client/src/app/core/services/agent-activity.service.ts`

**Event Subscription**:
```typescript
// Lines 174-188: Evaluation event listeners are registered
this.eventSource.addEventListener('evaluation_started', (e: MessageEvent) => {
  console.log('🔍 [EVALUATION] evaluation_started SSE event received');
  this.handleEvaluationStarted(JSON.parse(e.data));
});

this.eventSource.addEventListener('evaluation_completed', (e: MessageEvent) => {
  console.log('🔍 [EVALUATION] evaluation_completed SSE event received');
  this.handleEvaluationCompleted(JSON.parse(e.data));
});
```

**Event Handlers**:
- Lines 646-748: Proper handlers that update evaluation signals
- Comprehensive logging for debugging

✅ **Frontend code is correct**

### 3. Event Flow Verification

**Expected Flow**:
1. Orchestrator calls `emit(logId, 'evaluation_started', data)` → ✅ Confirmed in logs
2. LogService appends to database → ✅ Assumed working (other events work)
3. EventEmitter emits `log.${logId}` event → ✅ SSE controller logs "Received event"
4. SSE Controller transforms to UIEvent → ✅ Code exists (lines 324-345)
5. SSE Controller sends MessageEvent → ✅ Code exists (line 59)
6. Frontend EventSource receives event → ❓ **NO LOGS SEEN**

### 4. Debug Logging Added

**Changes Made**:
```typescript
// Line 58: Added detailed logging before sending
console.log(`[SSE] Sending event type="${messageEvent.type}" with data:`,
  JSON.stringify(uiEvent).substring(0, 100));
```

This will help verify:
- Event type is correctly set
- UIEvent is properly serialized
- Event is actually sent via `subscriber.next()`

## Possible Root Causes

### A. Server Not Auto-Reloading
**Status**: Likely issue
- Server running on port 3000 is from a previous session
- Watch mode may not have picked up the latest changes
- **Solution**: Restart the server to ensure latest code is running

### B. SSE Connection Issue
**Status**: Unlikely (other events work)
- Frontend receives other events (session_started, plan_created, etc.)
- SSE connection is established and working
- Only evaluation events are missing

### C. Event Timing Issue
**Status**: Possible
- Evaluation events happen very quickly after session start
- Frontend might connect AFTER evaluation completes
- **Mitigation**: `sendExistingLogs()` should replay all events (line 110-123)

### D. Database Not Persisting Evaluation Events
**Status**: Needs verification
- Backend logs show events are emitted
- Need to verify events are actually saved to database
- `sendExistingLogs()` reads from database, not live events

## Recommended Next Steps

1. **Verify Server Restart**
   - Ensure the running server on port 3000 has reloaded with latest code
   - Check server logs for the new debug logging output
   - If no new logs appear, manually restart server

2. **Check Database Persistence**
   - Verify evaluation events are saved to `log_entries` table
   - Use API endpoint: `GET /api/logs/sessions/{logId}`
   - Look for `eventType: "evaluation_started"` and `"evaluation_completed"`

3. **Test SSE Event Delivery**
   - Trigger new research query
   - Monitor both backend logs (for `[SSE] Sending event type="evaluation_..."`)
   - Monitor frontend console (for `🔍 [EVALUATION] evaluation_... SSE event received`)

4. **Verify sendExistingLogs**
   - Check if `sendExistingLogs()` includes evaluation events
   - Frontend might connect after evaluation completes
   - Need to verify database query returns all event types

## Code Changes Summary

### Modified Files
1. **src/research/research-stream.controller.ts**
   - Added debug logging to verify event sending (line 58)
   - No functional changes, only debugging

### Commits
- `2d96b40`: "debug: add SSE event logging to verify evaluation events are sent"

## Conclusion

The code appears to be **structurally correct** for streaming evaluation events:
- ✅ Backend emits events with correct event types
- ✅ SSE controller listens and transforms events
- ✅ Frontend subscribes to evaluation event types
- ✅ Event handlers are properly implemented

The issue is likely that the **running server hasn't picked up the latest changes** or there's a **database persistence issue** preventing evaluation events from being stored and replayed.

**Next Action**: Restart server and verify evaluation events appear in both backend logs and database.
