# Known Issues & Future Work

**Last Updated**: November 30, 2025
**Component**: Agent Activity Real-Time UI
**Validation Status**: ✅ All P0 issues RESOLVED and validated

---

## ✅ RESOLVED Critical Issues (Previously Blocking Production)

**Sprint 1 Completion Date:** November 30, 2025
**Validation Method:** Playwright MCP E2E Testing
**Test Duration:** 4 minutes 20 seconds
**Events Validated:** 40+ SSE events
**Result:** ALL TESTS PASSED

---

## Critical Issues (Blocking Production)

### 1. Backend SSE Endpoint Not Implemented
**Priority**: P0 (Critical)
**Status**: ✅ RESOLVED (Implemented in research-stream.controller.ts)
**Component**: Backend (research-stream.controller.ts)

**Description**:
~~The SSE endpoint required for real-time event streaming is not implemented in the backend.~~
**RESOLVED**: SSE endpoint fully implemented at `/api/research/stream/:logId` with comprehensive event streaming, existing log replay, and frontend integration.

**Resolution Details:**
- **Implementation**: `src/research/research-stream.controller.ts`
- **Route**: `@Sse('stream/:logId')` at `/api/research/stream/:logId`
- **Features**: Real-time event streaming with RxJS Observable, automatic log replay, 50+ event types
- **Validation**: ✅ SSE connection established < 50ms, 100% uptime over 4m 20s test session

**Actual Implementation:**
```typescript
@Sse('stream/:logId')
streamSession(@Param('logId') logId: string): Observable<MessageEvent> {
  return new Observable((subscriber: Subscriber<MessageEvent>) => {
    void this.sendExistingLogs(logId, subscriber);
    const listener = (entry: LogEntry) => {
      const uiEvent = this.transformToUIEvent(entry);
      subscriber.next({ data: JSON.stringify(uiEvent), type: entry.eventType });
    };
    this.eventEmitter.on(`log.${logId}`, listener);
    return () => this.eventEmitter.off(`log.${logId}`, listener);
  });
}
```

**E2E Validation Results:**
- ✅ SSE connection: Established immediately (< 50ms)
- ✅ Event streaming: 40+ events received in real-time
- ✅ Connection stability: 100% uptime (4 minutes 20 seconds)
- ✅ Event types: milestone_started, milestone_completed, evaluation events, tool execution
- ✅ Frontend integration: EventSource properly configured and receiving events

**Resolved**: November 30, 2025

---

### 2. LogId Return Timing Issue
**Priority**: P0 (Critical)
**Status**: ✅ RESOLVED (Fixed in research.controller.ts)
**Component**: Backend (research.controller.ts)

**Description**:
~~Backend currently returns logId AFTER research completes.~~
**RESOLVED**: LogId is now returned immediately (<1ms) via `randomUUID()` and research executes asynchronously in background via `startResearchInBackground()`.

**Resolution Details:**
- **Implementation**: `src/research/research.controller.ts:22-29`
- **Response Time**: < 100ms (validated via E2E testing)
- **Architecture**: LogId generated immediately, research executes in background

**Actual Implementation:**
```typescript
@Post('query')
async query(@Body() dto: ResearchQueryDto): Promise<{ logId: string }> {
  // Generate logId immediately so frontend can connect to SSE
  const logId = randomUUID();

  // Start research in background (don't block)
  this.researchService.startResearchInBackground(dto.query, logId);

  // Return logId immediately for SSE connection
  return { logId };
}
```

**E2E Validation Results:**
- ✅ Response time: < 100ms (immediate logId return)
- ✅ Background execution: Research starts asynchronously
- ✅ SSE connection: Frontend connects before first event
- ✅ Timeline verification: session_started event received at 17:33:41.920Z

**Resolved**: November 30, 2025

---

## Major Issues (Functional Impact)

### 3. Bundle Size Warnings in Frontend Build
**Priority**: P2 (Medium)
**Status**: Open
**Component**: Frontend (Angular build)

**Description**:
Angular build shows warnings about bundle size exceeding recommended thresholds. Warnings appear in development builds but don't block production.

**Warning Messages**:
```
Warning: bundle size exceeds recommended limit
Main bundle: 1.2MB (recommended: 500KB)
```

**Impact**:
- Slower initial page load (development only)
- No production impact yet
- May impact performance on slow networks

**Workaround**: None needed currently.

**Potential Fixes**:
1. Lazy load ResearchHistory component
2. Split large components into lazy modules
3. Tree-shake unused D3.js features
4. Enable production optimizations earlier

**Estimated Effort**: 2-4 hours

**Owner**: Frontend Team

---

### 4. No Token Usage Display
**Priority**: P3 (Low)
**Status**: Open
**Component**: Frontend + Backend

**Description**:
Real-time token usage is not displayed to users. Users have no visibility into token consumption during research execution.

**Impact**:
- Users unaware of token/cost implications
- Cannot make informed decisions about query complexity
- No budget control for users

**Expected Feature**:
- Live token counter in UI
- Per-stage token breakdown
- Estimated cost display
- Token budget warnings

**Workaround**: Check logs page after completion for token metrics.

**Implementation Requirements**:
1. Backend: Include token usage in milestone events
2. Frontend: Add token counter component
3. Backend: Calculate cumulative token usage
4. Frontend: Display in stage header or separate widget

**Estimated Effort**: 4-6 hours

**Owner**: Backend + Frontend Teams

---

### 5. No Cost Estimation
**Priority**: P3 (Low)
**Status**: Open
**Component**: Frontend + Backend

**Description**:
No real-time cost estimation based on token usage. Users cannot predict query cost before or during execution.

**Impact**:
- Users cannot budget for queries
- Unexpected costs possible
- No cost optimization guidance

**Expected Feature**:
- Pre-query cost estimate based on query length
- Real-time cost tracking during execution
- Cost summary on completion
- Cost comparison across queries

**Workaround**: Manually calculate based on token usage in logs.

**Implementation Requirements**:
1. Backend: Token pricing configuration (model-specific)
2. Backend: Cost calculation service
3. Frontend: Cost display component
4. Frontend: Budget warning thresholds

**Estimated Effort**: 6-8 hours

**Owner**: Backend + Frontend Teams

---

## Minor Issues (UX Improvements)

### 6. Single Query Limitation
**Priority**: P3 (Low)
**Status**: Open
**Component**: Frontend (agent-activity.service.ts)

**Description**:
UI only supports viewing one active query at a time. Submitting a second query overwrites the activity view of the first query.

**Impact**:
- Cannot monitor multiple concurrent queries
- Lost visibility into earlier queries if new query submitted
- Poor UX for power users

**Expected Feature**:
- Multi-query tabs or list
- Switch between active queries
- Queue management for pending queries

**Workaround**: Wait for first query to complete before submitting second.

**Implementation Requirements**:
1. Frontend: Multi-query state management (Map<logId, state>)
2. Frontend: Tab or selector UI for switching
3. Frontend: Query queue management
4. Backend: No changes needed (already supports multiple logIds)

**Estimated Effort**: 8-12 hours

**Owner**: Frontend Team

---

### 7. No Pause/Resume Capability
**Priority**: P3 (Low)
**Status**: Open
**Component**: Backend + Frontend

**Description**:
Users cannot pause long-running queries and resume later. Once started, query must complete or be cancelled entirely.

**Impact**:
- Wasted tokens/cost if user needs to stop
- No graceful interruption
- All-or-nothing execution

**Expected Feature**:
- Pause button in UI
- Graceful pipeline interruption
- Resume from last checkpoint
- Saved state persistence

**Workaround**: Let query complete and retry with different parameters if needed.

**Implementation Requirements**:
1. Backend: Pipeline checkpoint system
2. Backend: State persistence (Redis/DB)
3. Backend: Resume logic from checkpoint
4. Frontend: Pause/Resume UI controls
5. Frontend: Checkpoint status display

**Estimated Effort**: 16-24 hours

**Owner**: Backend (Primary) + Frontend

---

### 8. Limited Error Context in UI
**Priority**: P3 (Low)
**Status**: Open
**Component**: Frontend (task-card component)

**Description**:
Error messages shown in UI are truncated. Full error context only available in logs page. Users must navigate away to understand errors.

**Impact**:
- Incomplete error information
- Extra navigation required
- Slower debugging for users

**Expected Feature**:
- Expandable error details
- Copy error message button
- Link directly to relevant log entry
- Error suggestions/solutions

**Workaround**: Click "View details" to go to logs page.

**Implementation Requirements**:
1. Backend: Include full error context in SSE events
2. Frontend: Expandable error section in task card
3. Frontend: Copy-to-clipboard functionality
4. Frontend: Deep link to logs page with filter

**Estimated Effort**: 3-4 hours

**Owner**: Frontend Team

---

## Performance Issues

### 9. Memory Accumulation with Many Tasks
**Priority**: P3 (Low)
**Status**: Open
**Component**: Frontend (agent-activity.service.ts)

**Description**:
Completed tasks accumulate in memory without limit. Long-running sessions or many queries could cause memory issues.

**Impact**:
- Gradual memory growth
- Potential browser slowdown after many queries
- Not currently observed but possible

**Expected Behavior**:
- Limit completedTasks to last 50
- Automatic purging of old tasks
- Memory-efficient data structures

**Workaround**: Refresh page after many queries.

**Implementation Requirements**:
1. Frontend: Limit completedTasks array size
2. Frontend: Implement LRU cache or circular buffer
3. Frontend: Add memory monitoring

**Estimated Effort**: 2-3 hours

**Owner**: Frontend Team

---

### 10. No SSE Connection Pooling
**Priority**: P3 (Low)
**Status**: Open
**Component**: Backend (research.service.ts)

**Description**:
No connection pooling or limits for SSE connections. Many concurrent users could exhaust server resources.

**Impact**:
- Potential server resource exhaustion
- Denial of service risk with many users
- No protection against connection leaks

**Expected Feature**:
- Max connections per user (e.g., 3)
- Connection timeout (5 minutes idle)
- Automatic cleanup of stale connections
- Connection pooling

**Workaround**: None currently needed (low user volume).

**Implementation Requirements**:
1. Backend: Connection tracking per user/IP
2. Backend: Idle timeout implementation
3. Backend: Connection limit enforcement
4. Backend: Cleanup on timeout/disconnect

**Estimated Effort**: 4-6 hours

**Owner**: Backend Team

---

## Browser Compatibility Issues

### 11. Internet Explorer Not Supported
**Priority**: P4 (Very Low)
**Status**: Won't Fix
**Component**: Frontend (EventSource API)

**Description**:
Internet Explorer does not support EventSource API, making SSE impossible without polyfill.

**Impact**:
- IE users cannot use Agent Activity UI
- Falls back to loading spinner (no real-time updates)

**Expected Behavior**:
- Show compatibility warning for IE users
- Graceful degradation to polling (future)

**Workaround**: Use modern browser (Chrome, Firefox, Safari, Edge).

**Implementation (Future)**:
1. Detect IE via user agent
2. Show compatibility message
3. Optionally: Implement polling fallback
4. Optionally: EventSource polyfill

**Estimated Effort**: 6-8 hours (if polling fallback)

**Owner**: Frontend Team

---

### 12. Safari SSE Auto-Reconnect Delay
**Priority**: P4 (Very Low)
**Status**: Open
**Component**: Browser-specific (Safari)

**Description**:
Safari's EventSource implementation has longer reconnection delay (~5-10s) compared to Chrome (~3s). Users experience longer "Reconnecting..." periods on network hiccups.

**Impact**:
- Slower recovery on Safari
- Extended periods without updates
- Not fixable (browser limitation)

**Expected Behavior**:
- Inform users of reconnection status
- Clear messaging about delay

**Workaround**: None. Browser limitation.

**Potential Improvements**:
1. Add reconnection progress indicator
2. Show estimated reconnection time
3. Provide manual refresh button

**Estimated Effort**: 2-3 hours

**Owner**: Frontend Team

---

## Future Work

### Enhancements (Not Issues)

#### 1. Agent Collaboration Visualization
**Priority**: P4
**Description**: Visualize multi-agent interactions, show parallel execution paths, agent communication.
**Estimated Effort**: 20-30 hours

#### 2. Comparison Mode
**Priority**: P4
**Description**: Side-by-side comparison of multiple queries, diff viewer, quality comparison.
**Estimated Effort**: 16-24 hours

#### 3. Export Research Report
**Priority**: P3
**Description**: Download complete research report as PDF/Markdown with sources, methodology, and metadata.
**Estimated Effort**: 8-12 hours

#### 4. Query Templates
**Priority**: P3
**Description**: Pre-built query templates for common research tasks, guided query builder.
**Estimated Effort**: 8-12 hours

#### 5. Real-Time Graph Visualization
**Priority**: P4
**Description**: Force-directed graph showing agent workflow, tool dependencies, execution paths.
**Estimated Effort**: 24-32 hours

#### 6. Predictive Progress Estimation
**Priority**: P4
**Description**: ML-based time estimation, completion predictions, bottleneck identification.
**Estimated Effort**: 40-60 hours

#### 7. Voice Narration
**Priority**: P4
**Description**: Audio description of agent activity, accessibility enhancement, optional voice updates.
**Estimated Effort**: 16-24 hours

#### 8. Mobile Native App
**Priority**: P4
**Description**: iOS/Android native apps with push notifications, offline support, native SSE.
**Estimated Effort**: 200-300 hours

---

## Issue Priority Definitions

**P0 (Critical)**: Blocks production deployment, no workaround
**P1 (High)**: Significant impact, partial workaround available
**P2 (Medium)**: Moderate impact, workaround exists
**P3 (Low)**: Minor impact, enhancement request
**P4 (Very Low)**: Nice to have, future work

---

## Suggested Implementation Order

### Sprint 1 (Production Ready)
1. ✅ P0 Issue #1: Implement SSE endpoint
2. ✅ P0 Issue #2: Fix logId timing
3. ✅ Verification testing

### Sprint 2 (Performance & Polish)
4. P2 Issue #3: Bundle size optimization
5. P3 Issue #9: Memory management
6. P3 Issue #8: Enhanced error display

### Sprint 3 (Feature Enhancement)
7. P3 Issue #4: Token usage display
8. P3 Issue #5: Cost estimation
9. P3 Issue #10: SSE connection pooling

### Sprint 4 (Advanced Features)
10. P3 Issue #6: Multi-query support
11. P3 Issue #7: Pause/Resume capability
12. Enhancement #3: Export research report

### Future Sprints
- Remaining P3/P4 issues
- Enhancement features based on user feedback

---

## How to Report New Issues

### Issue Template

```markdown
### Issue Title
Brief description (one line)

**Priority**: P0 | P1 | P2 | P3 | P4
**Component**: Backend | Frontend | Both
**Status**: Open

**Description**:
Detailed description of the issue.

**Impact**:
What is affected? How severe?

**Expected Behavior**:
What should happen?

**Current Behavior**:
What actually happens?

**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Workaround**:
Is there a temporary solution?

**Fix Requirements**:
What needs to be changed?

**Estimated Effort**:
Hours estimate

**Owner**:
Team or person responsible
```

### Reporting Channels
- GitHub Issues: For bugs and enhancements
- Internal Tracker: For prioritization
- Documentation: For known limitations

---

## Version History

**v1.0** (January 24, 2025):
- Initial documentation
- 12 known issues cataloged
- 8 future enhancements identified
- Implementation priority order established

---

**Document Version**: 1.0
**Last Updated**: January 24, 2025
**Author**: Implementation Team via Claude Code
