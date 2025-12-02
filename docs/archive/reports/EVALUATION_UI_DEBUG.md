# Evaluation Events UI Debug Guide

## Summary

Added comprehensive debug logging to trace evaluation events from backend to frontend display.

## Files Modified

### Frontend Changes
- **client/src/app/core/services/agent-activity.service.ts**
  - Added debug logging to event listener registration (line 174)
  - Added logging when SSE events are received (lines 176, 181, 186)
  - Added logging in event handlers (lines 647, 676, 721)
  - Added logging when signals are updated (lines 662, 666, 670, 707, 711, 715, 737, 741, 745)

## Debug Logging Pattern

All evaluation-related logs are prefixed with `🔍 [EVALUATION]` for easy filtering.

### Expected Log Flow

When an evaluation occurs, you should see this sequence in the browser console:

1. **On Connection**:
   ```
   🔍 [EVALUATION] Registering evaluation event listeners
   ```

2. **When Evaluation Starts**:
   ```
   🔍 [EVALUATION] evaluation_started SSE event received
   🔍 [EVALUATION] Evaluation started event received: {phase: "plan", query: "..."}
   🔍 [EVALUATION] Setting plan evaluation signal to in_progress
   🔍 [EVALUATION] planEvaluation signal updated: {phase: "plan", status: "in_progress", ...}
   ```

3. **When Evaluation Completes**:
   ```
   🔍 [EVALUATION] evaluation_completed SSE event received
   🔍 [EVALUATION] Evaluation completed event received: {phase: "plan", passed: true, scores: {...}}
   🔍 [EVALUATION] Setting plan evaluation signal to completed with status: passed
   🔍 [EVALUATION] planEvaluation signal updated: {phase: "plan", status: "passed", scores: {...}}
   ```

## How to Test

### 1. Build the Frontend
```bash
cd client
npm run build
```

### 2. Start the Backend
```bash
npm run start:dev
```

### 3. Submit a Research Query
Open the application in your browser and submit a research query.

### 4. Open Browser DevTools Console
- Press F12 or right-click and select "Inspect"
- Go to the Console tab
- Filter by "EVALUATION" to see only evaluation-related logs

### 5. Monitor the Logs
Watch for the debug logs as evaluation events occur. You should see:
- Event listener registration on page load
- SSE events being received
- Event handlers being called
- Signals being updated

## Expected Behavior

### If Events Are Working
You should see:
1. Event listeners registered successfully
2. SSE events received for `evaluation_started` and `evaluation_completed`
3. Event handlers processing the data
4. Signals being updated with evaluation results
5. **Evaluation cards appearing in the UI** showing:
   - Phase label (Plan Quality, Retrieval Quality, Answer Quality)
   - Status (Passed/Failed/Skipped/In Progress)
   - Score bars with percentages
   - Confidence level
   - Iteration count
   - Escalation indicator (if applicable)

### If Events Are NOT Working
Check which step is failing:

#### No Event Listener Registration Log
**Issue**: Frontend service not being initialized
**Fix**: Check component lifecycle and service injection

#### No SSE Event Received Log
**Issue**: Backend not emitting events OR SSE connection issue
**Check**:
- Backend logs for `evaluation_started` emission
- Network tab in DevTools for SSE stream connection
- SSE stream controller event transformation

#### SSE Event Received but Handler Not Called
**Issue**: Event parsing error or handler exception
**Check**:
- Console for JavaScript errors
- Event data structure matches expected format

#### Handler Called but Signal Not Updated
**Issue**: Signal update logic error
**Check**:
- Phase name matches expected values ('plan', 'retrieval', 'answer')
- Event data structure is correct

#### Signal Updated but UI Not Showing
**Issue**: Component not subscribed to signals OR template condition issue
**Check**:
- Component computed signals (lines 51-53 in agent-activity-view.component.ts)
- Template conditions (lines 109-121 in agent-activity-view.component.html)
- EvaluationDisplayComponent is properly imported and declared

## Troubleshooting

### Case 1: Events Reach Frontend but Don't Display

**Symptoms**:
- Logs show: ✅ Event listeners registered
- Logs show: ✅ SSE events received
- Logs show: ✅ Signals updated
- UI shows: ❌ No evaluation cards

**Diagnosis**:
The issue is in the component/template layer, not the event flow.

**Possible Causes**:
1. Template condition is false (evaluation signal is null)
2. EvaluationDisplayComponent has rendering issue
3. CSS hiding the element

**Solution**:
1. Check browser Elements tab to see if evaluation-display elements exist in DOM
2. Verify computed signals in component return non-null values
3. Check CSS for `display: none` or similar hiding

### Case 2: Events Don't Reach Frontend

**Symptoms**:
- Logs show: ✅ Event listeners registered
- Logs show: ❌ No SSE events received

**Diagnosis**:
Backend is not emitting events OR SSE stream has issues.

**Solution**:
1. Check backend logs for `[Orchestrator] evaluation_started event emitted`
2. Check Network tab in DevTools for SSE stream messages
3. Verify event type name matches exactly (`evaluation_started`, not `evaluationStarted`)

### Case 3: Events Malformed

**Symptoms**:
- Logs show: ✅ SSE events received
- Logs show: ❌ Handler error or undefined values

**Diagnosis**:
Event data structure doesn't match expected format.

**Solution**:
1. Log the full event object to see its structure
2. Verify backend is sending all required fields
3. Check for typos in field names (phase vs phaseName, etc.)

## Known Issues

None currently identified.

## Next Steps

Once evaluation events are confirmed working:
1. Remove or reduce debug logging for production
2. Add proper error handling for malformed events
3. Consider adding retry logic for failed evaluations
4. Add user-facing error messages for evaluation failures

## Related Files

### Backend
- `src/orchestration/orchestrator.service.ts` - Emits evaluation events
- `src/research/research-stream.controller.ts` - Transforms events for SSE
- `src/logging/interfaces/log-event-type.enum.ts` - Event type definitions

### Frontend
- `client/src/app/core/services/agent-activity.service.ts` - Receives and processes events
- `client/src/app/features/research/components/agent-activity-view/agent-activity-view.component.ts` - Component consuming signals
- `client/src/app/features/research/components/agent-activity-view/agent-activity-view.component.html` - Template displaying evaluations
- `client/src/app/features/research/components/evaluation-display/evaluation-display.component.ts` - Evaluation display component
- `client/src/app/models/evaluation.model.ts` - Evaluation data models
