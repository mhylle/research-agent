# Agent Activity UI Quick Start Guide

**Last Updated**: January 24, 2025
**Audience**: Developers
**Time to Complete**: 15-30 minutes

---

## Overview

Quick start guide for testing and developing the Agent Activity Real-Time UI feature. This guide assumes basic familiarity with NestJS and Angular.

---

## Prerequisites

### Required Software
- Node.js 18+ installed
- npm or yarn package manager
- Git (for version control)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Optional Tools
- VSCode or preferred IDE
- Browser DevTools knowledge
- Postman or curl for API testing

### Project Setup
```bash
# Clone repository (if not already)
git clone <repository-url>
cd research-agent

# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..
```

---

## Quick Start (Development)

### Step 1: Start Backend Server

**Terminal 1**:
```bash
# From project root
npm run start:dev
```

**Expected Output**:
```
[Nest] 12345  - 01/24/2025, 10:00:00 AM     LOG [NestApplication] Nest application successfully started
[Nest] 12345  - 01/24/2025, 10:00:00 AM     LOG [RoutesResolver] ResearchController {/api/research}:
[Nest] 12345  - 01/24/2025, 10:00:00 AM     LOG Listening on http://localhost:3000
```

**Verify Backend**:
```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Expected response:
{"status":"healthy","services":{"ollama":true,"tavily":true}}
```

### Step 2: Start Frontend Server

**Terminal 2**:
```bash
# From project root
cd client
npm run start
```

**Expected Output**:
```
✔ Browser application bundle generation complete.
Initial Chunk Files   | Names         |  Raw Size
main.js               | main          |   1.2 MB
...
** Angular Live Development Server is listening on localhost:4200 **
```

**Verify Frontend**:
Open browser to `http://localhost:4200`

### Step 3: Test Basic Flow

1. **Navigate to Research Page**: `http://localhost:4200`
2. **Submit Test Query**: "What is quantum computing?"
3. **Observe**:
   - Loading indicator appears immediately
   - ⚠️ Currently: Full answer loads after 10-15s
   - ✅ Expected: Agent activity view appears with real-time updates

**Current Limitation**: SSE endpoint not implemented yet, so agent activity view won't show. See "Backend Implementation Required" section below.

---

## Backend Implementation Required

> **Critical**: Before agent activity UI works, implement SSE endpoint.

### Implementation Checklist

#### 1. Add SSE Endpoint to Controller

**File**: `src/research/research.controller.ts`

```typescript
import { Controller, Get, Post, Body, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';

@Controller('api/research')
export class ResearchController {
  // ... existing endpoints

  @Get('stream/events/:logId')
  @Sse()
  streamEvents(@Param('logId') logId: string): Observable<MessageEvent> {
    return this.researchService.getEventStream(logId);
  }
}
```

#### 2. Add Event Stream Method to Service

**File**: `src/research/research.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ResearchService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    // ... other dependencies
  ) {}

  getEventStream(logId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      // Handler for events specific to this logId
      const handler = (event: any) => {
        const messageEvent: MessageEvent = {
          data: JSON.stringify(event),
          type: `node-${event.event}`, // e.g., 'node-milestone', 'node-complete'
        };
        subscriber.next(messageEvent);
      };

      // Subscribe to events for this specific logId
      this.eventEmitter.on(`event:${logId}`, handler);

      // Cleanup function called when client disconnects
      return () => {
        this.eventEmitter.off(`event:${logId}`, handler);
        console.log(`SSE connection closed for logId: ${logId}`);
      };
    });
  }

  // ... rest of service
}
```

#### 3. Fix LogId Return Timing

**File**: `src/research/research.service.ts`

**Current** (Wrong):
```typescript
async submitQuery(query: string): Promise<ResearchResult> {
  const logId = this.generateLogId();
  const result = await this.executeResearch(logId, query); // Wait 10-15s
  return { logId, ...result }; // Too late
}
```

**Updated** (Correct):
```typescript
async submitQuery(query: string): Promise<{ logId: string }> {
  const logId = this.generateLogId();

  // Fire and forget - don't await
  this.executeResearch(logId, query).catch((error) => {
    console.error(`Research execution failed for ${logId}:`, error);
  });

  // Return immediately
  return { logId };
}
```

#### 4. Test SSE Endpoint

```bash
# Test SSE connection (use -N flag for no-buffer)
curl -N http://localhost:3000/api/research/stream/events/test-log-id

# Expected: Connection stays open, events stream as they occur
# Sample output:
event: node-milestone
data: {"logId":"abc","nodeId":"stage1_milestone_1","event":"milestone",...}

event: node-progress
data: {"logId":"abc","nodeId":"stage1","event":"progress","data":{"progress":50}}

event: node-complete
data: {"logId":"abc","nodeId":"stage1","event":"complete","timestamp":"2025-01-24T..."}
```

---

## Testing the Complete Flow

### End-to-End Test

**Prerequisites**:
- Backend SSE endpoint implemented (see above)
- Both servers running (backend + frontend)
- Browser open to `http://localhost:4200`

**Test Steps**:

1. **Submit Query**:
   - Type: "What is artificial intelligence?"
   - Click "Search" button
   - **Observe**: Query submitted, logId returned immediately

2. **Watch Agent Activity View**:
   - **Observe**: Activity view appears (replaces loading spinner)
   - **Observe**: Stage header shows "Stage 1 of 3: Analyzing query & searching"
   - **Observe**: Progress bar at 0%

3. **Watch Real-Time Updates**:
   - **Observe**: Tasks appear one by one:
     - "Deconstructing query into core topics" (20%)
     - "Identifying key terms: artificial, intelligence, AI" (40%)
     - "Searching 25 databases: NASA, arXiv, Nature" (70%)
     - "Filtering results for credibility" (90%)
   - **Observe**: Progress bar animates smoothly
   - **Observe**: Stage completes (100%)

4. **Watch Stage Transitions**:
   - **Observe**: Stage header updates to "Stage 2 of 3: Content fetch & selection"
   - **Observe**: New tasks appear for Stage 2
   - **Observe**: Per-source fetch tasks with URLs
   - **Observe**: Stage completes

5. **Watch Final Stage**:
   - **Observe**: Stage header updates to "Stage 3 of 3: Synthesis & answer generation"
   - **Observe**: Final synthesis tasks appear
   - **Observe**: Stage completes

6. **Verify Completion**:
   - **Observe**: All tasks move to "Completed Tasks" section (collapsed)
   - **Observe**: Answer appears below activity view
   - **Observe**: History section updates with new query
   - **Observe**: No errors in browser console

### Browser DevTools Verification

**Network Tab**:
1. Open DevTools (F12) → Network tab
2. Submit query
3. **Check**: POST request to `/api/research/query` returns logId immediately
4. **Check**: EventSource connection to `/research/stream/events/:logId` established
5. **Check**: Connection status "pending" (stays open)
6. **Check**: Events appearing in real-time (EventStream section)

**Console Tab**:
- **Check**: No errors
- **Optional**: Enable verbose logging to see event processing

**Performance Tab** (Optional):
- Record session during query
- **Check**: UI rendering stays <16ms (60fps)
- **Check**: Memory doesn't grow excessively

---

## Testing Error Handling

### Test Retry Mechanism

**Create Intentional Error** (Backend):
```typescript
// Temporarily modify a tool to always fail
export class WebFetchProvider implements ITool {
  async execute(args: any): Promise<any> {
    throw new Error('Simulated 403 Forbidden error');
  }
}
```

**Test Retry**:
1. Submit query
2. **Observe**: Task shows error state (red border)
3. **Observe**: Error message displays: "Simulated 403 Forbidden error"
4. **Observe**: "Retry" button appears
5. Click "Retry" button
6. **Observe**: Task status changes to "retrying" (orange border)
7. **Observe**: Task still fails (if error not fixed)
8. **Verify**: Retry count increments (max 3 attempts)

**Revert Error**: Remove simulated error after testing.

### Test Connection Loss

**Simulate Network Loss**:
1. Start query
2. Wait for tasks to appear
3. Stop backend server: Ctrl+C in Terminal 1
4. **Observe**: Connection status shows "Connection lost. Reconnecting..."
5. Restart backend: `npm run start:dev`
6. **Observe**: Connection re-establishes automatically
7. **Observe**: Tasks resume updating (EventSource auto-reconnect)

---

## Testing Responsive Design

### Mobile Testing (480px)

**Method 1 - Browser DevTools**:
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M or Cmd+Shift+M)
3. Select "iPhone SE" or similar (375x667)
4. Submit query
5. **Verify**:
   - Activity view fits screen
   - Text readable without zooming
   - Buttons tappable (44px minimum)
   - No horizontal scroll

**Method 2 - Real Device**:
1. Get local IP: `ifconfig | grep inet` (Mac/Linux) or `ipconfig` (Windows)
2. Open `http://<your-ip>:4200` on mobile device
3. Submit query
4. **Verify**: Same checks as above

### Tablet Testing (768px)

**Browser DevTools**:
1. Device toolbar → iPad (768x1024)
2. Submit query
3. **Verify**:
   - Layout uses tablet-optimized spacing
   - Two-column layout if applicable
   - Touch-friendly interactions

### Desktop Testing (1200px+)

**Full Screen**:
1. Maximize browser window
2. Submit query
3. **Verify**:
   - Content centered with max-width
   - Optimal reading width maintained
   - No excessively long lines

---

## Testing Accessibility

### Screen Reader Testing

**macOS (VoiceOver)**:
```bash
# Enable VoiceOver
Cmd + F5

# Navigate
Ctrl + Option + Arrow Keys

# Interact
Ctrl + Option + Space
```

**Windows (NVDA)**:
1. Download and install NVDA (free)
2. Start NVDA
3. Navigate with arrows
4. Test announcements during query execution

**Verification**:
- [ ] Stage transitions announced: "Stage 1 of 3, 50 percent complete"
- [ ] Task status changes announced
- [ ] Error messages read aloud
- [ ] Buttons labeled correctly: "Retry failed task"
- [ ] Progress updates announced

### Keyboard Navigation

**Test Steps**:
1. Tab through UI
2. **Verify**: Focus visible (blue outline)
3. **Verify**: Tab order logical (top to bottom)
4. Press Enter on "Retry" button
5. **Verify**: Retry triggered
6. Press Space on "Retry" button
7. **Verify**: Retry triggered
8. Tab to history item, press Enter
9. **Verify**: Expands/collapses

### ARIA Validation

**Using axe DevTools** (Browser Extension):
1. Install axe DevTools extension
2. Open DevTools → axe tab
3. Click "Scan ALL of my page"
4. **Verify**: No critical/serious issues
5. Review any minor issues

---

## Troubleshooting

### Issue: "Cannot connect to backend"

**Symptoms**: Frontend shows errors, API calls fail

**Checks**:
```bash
# Is backend running?
curl http://localhost:3000/api/health

# If not running:
cd /path/to/project
npm run start:dev
```

### Issue: "SSE connection failed"

**Symptoms**: Activity view shows "Connecting..." indefinitely

**Checks**:
```bash
# Test SSE endpoint directly
curl -N http://localhost:3000/api/research/stream/events/test-id

# Expected: Connection opens, no immediate response
# If 404: SSE endpoint not implemented
# If CORS error: Check browser console
```

**CORS Fix** (if needed):
```typescript
// src/main.ts
app.enableCors({
  origin: 'http://localhost:4200',
  credentials: true,
});
```

### Issue: "No tasks appearing"

**Symptoms**: Activity view shows but tasks list empty

**Checks**:
1. Open browser console (F12)
2. Look for errors
3. Check Network tab → EventSource events
4. Verify milestone emission in backend logs

**Backend Verification**:
```bash
# Check logs for milestone emissions
tail -f logs/research-combined.log | grep milestone
```

### Issue: "Retry button not working"

**Symptoms**: Click retry, nothing happens

**Checks**:
1. Open browser console
2. Look for network errors
3. Check POST request to `/api/research/retry/:logId/:nodeId`

**Test Retry Endpoint**:
```bash
curl -X POST http://localhost:3000/api/research/retry/test-log-id/test-node-id

# Expected: {"success":true,"message":"Node retry successful"}
# or {"success":false,"message":"Node not found"}
```

### Issue: "Performance issues"

**Symptoms**: UI feels sluggish, choppy animations

**Checks**:
1. Close DevTools (they impact performance)
2. Check CPU usage (Activity Monitor / Task Manager)
3. Reduce number of concurrent tasks
4. Check browser extensions (disable ad blockers)

**Memory Check**:
```javascript
// In browser console
console.log(performance.memory); // Chrome only
```

---

## Common Development Tasks

### Adding a New Milestone

**1. Add Template** (`src/logging/milestone-templates.ts`):
```typescript
{
  id: 'stage1_new_task',
  stage: 1,
  template: 'Performing new task with {param}',
  expectedProgress: 60,
  order: 3.5,
}
```

**2. Emit in Pipeline** (`src/research/pipeline-executor.service.ts`):
```typescript
this.logger.logMilestone(
  logId,
  `${nodeId}_new_task`,
  'stage1_new_task',
  1,
  template,
  { param: 'value' },
  60,
  'running'
);
```

**3. Test**: Submit query, verify new milestone appears in UI

### Modifying Task Card UI

**File**: `client/src/app/features/research/components/task-card/`

**Change Status Colors**:
```scss
// task-card.scss
&.status-running {
  border-left-color: #your-color; // Change blue
}
```

**Add New Status**:
1. Add to `TaskStatus` type in `activity-task.model.ts`
2. Add handler in `getStatusClass()` in `task-card.ts`
3. Add styles in `task-card.scss`
4. Test with manual mock data

### Customizing Progress Bar

**File**: `client/src/app/features/research/components/stage-progress-header/stage-progress-header.scss`

```scss
.progress-fill {
  background: linear-gradient(90deg, #your-color-1, #your-color-2);
  // Or solid color:
  background: #your-color;
}
```

---

## Next Steps

### After Quick Start

1. **Read Full Documentation**:
   - [Implementation Summary](../summaries/agent-activity-ui-implementation.md)
   - [Session Context](../context/2025-01-24-session-context.md)
   - [Known Issues](../known-issues.md)

2. **Implement SSE Endpoint**:
   - Follow "Backend Implementation Required" section
   - Test with curl
   - Verify with frontend

3. **Run Full Test Suite**:
   - Functional tests
   - Accessibility tests
   - Responsive design tests
   - Error handling tests

4. **Deploy to Staging**:
   - Update environment variables
   - Configure CORS
   - Test with production-like data

### Learning Resources

**Angular Signals**:
- [Official Documentation](https://angular.io/guide/signals)
- [Best Practices](https://angular.io/guide/signals#best-practices)

**Server-Sent Events**:
- [MDN Guide](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)

**NestJS SSE**:
- [Official Documentation](https://docs.nestjs.com/techniques/server-sent-events)
- [Example Implementation](https://github.com/nestjs/nest/tree/master/sample/28-sse)

**Accessibility**:
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

---

## Getting Help

### If You're Stuck

1. **Check Known Issues**: [docs/known-issues.md](../known-issues.md)
2. **Read Session Context**: [docs/context/2025-01-24-session-context.md](../context/2025-01-24-session-context.md)
3. **Review Implementation Plan**: [docs/plans/2025-01-24-agent-activity-realtime-ui.md](../plans/2025-01-24-agent-activity-realtime-ui.md)

### Common Questions

**Q: Why isn't the activity view showing?**
A: SSE endpoint not implemented. See "Backend Implementation Required" section.

**Q: Can I test frontend without implementing backend SSE?**
A: Limited testing only. You can test component rendering with mock data, but not real-time updates.

**Q: How do I add my own milestone?**
A: See "Adding a New Milestone" in Common Development Tasks section.

**Q: Where are the events logged?**
A: Backend: `logs/research-combined.log`. Filter by logId for specific session.

**Q: How do I debug SSE connection issues?**
A: Browser DevTools → Network tab → Filter by "EventStream". Check connection status and events.

---

## Appendix

### Useful Commands

```bash
# Start both servers
npm run dev

# Backend only
npm run start:dev

# Frontend only
cd client && npm run start

# Build production
npm run build:all

# Run tests
npm test                    # Backend
cd client && npm test       # Frontend

# Lint code
npm run lint                # Backend
cd client && npm run lint   # Frontend (if configured)

# Format code
npm run format              # Backend
cd client && npm run format # Frontend (if configured)

# Check TypeScript
npm run build               # Backend
cd client && npm run build  # Frontend
```

### Key File Locations

**Backend**:
- Controller: `src/research/research.controller.ts`
- Service: `src/research/research.service.ts`
- Logger: `src/logging/research-logger.service.ts`
- Templates: `src/logging/milestone-templates.ts`
- Pipeline: `src/research/pipeline-executor.service.ts`

**Frontend**:
- Service: `client/src/app/core/services/agent-activity.service.ts`
- Main View: `client/src/app/features/research/components/agent-activity-view/`
- Task Card: `client/src/app/features/research/components/task-card/`
- History: `client/src/app/features/research/components/research-history/`
- Models: `client/src/app/models/activity-task.model.ts`

---

**Document Version**: 1.0
**Last Updated**: January 24, 2025
**Author**: Implementation Team via Claude Code
