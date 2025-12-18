# Implementation Prompt: Chat + Research SSE Timeout Fix

## Overview

This prompt implements the fix for the chat + research SSE timeout issue using an orchestrator pattern that delegates all implementation work to subagents.

**Plan Document:** `/home/mnh/.claude/plans/dynamic-wandering-cherny.md`

---

## Prompt

```
Implement the Chat + Research SSE Timeout Fix according to the plan at:
/home/mnh/.claude/plans/dynamic-wandering-cherny.md

IMPORTANT ORCHESTRATION REQUIREMENTS:
1. This is an ORCHESTRATION SESSION - do NOT implement code directly in this session
2. Spawn SUBAGENTS for all implementation work using the Task tool
3. Track progress using TodoWrite in THIS session
4. Coordinate subagents and validate their work from this orchestration layer

## Implementation Strategy

### Phase Overview
Read the plan document to understand:
- Root cause: SSE heartbeat timeout (30s) vs research duration (9-16s+) with no intermediate events
- Solution: Forward research progress through chat SSE stream with dual-channel listening
- Files to modify: 7 files (4 backend, 3 frontend)
- Success criteria: No timeout during research, real-time progress visible

### Orchestration Workflow

1. **Initial Planning** (Orchestrator Session)
   - Read the plan: /home/mnh/.claude/plans/dynamic-wandering-cherny.md
   - Read project guidelines: /home/mnh/projects/research-agent/CLAUDE.md
   - Create TodoWrite task list with all implementation tasks
   - Identify dependencies between tasks (backend before frontend)

2. **Task Delegation** (Orchestrator → Subagents)

   **Phase 1: Backend Changes (Sequential - has dependencies)**

   Task 1.1: Update Chat Stream Event Interface
   ```
   /task Create updated chat-stream-event.interface.ts

   Context: Fixing chat + research SSE timeout issue
   File: src/chat/interfaces/chat-stream-event.interface.ts

   Changes needed:
   - Add ResearchProgressData interface with: logId, stage, progress, phaseName, toolName, eventType
   - Add new event types to ChatStreamEvent: 'research_progress' | 'heartbeat'
   - Add data?: ResearchProgressData to ChatStreamEvent

   Follow patterns in: src/research/research-stream.controller.ts (UIEvent interface)
   Verify: npm run lint passes
   ```

   Task 1.2: Update Chat Research Service (depends on 1.1)
   ```
   /task Split chat-research.service.ts initialization

   Context: Need logId available BEFORE research starts for SSE tracking
   File: src/chat/services/chat-research.service.ts

   Changes:
   - Add initializeResearch() method that returns { logId, contextualizedQuery }
   - Add executeResearchWithLogId() method that accepts existing logId
   - Keep executeResearchWithContext() as deprecated wrapper

   Pattern: Split the blocking operation so logId is available immediately
   Verify: npm run lint && npm run build
   ```

   Task 1.3: Update Chat Orchestrator (depends on 1.2)
   ```
   /task Update chat-orchestrator.service.ts to emit logId

   Context: research_start event needs logId for frontend to track progress
   File: src/chat/services/chat-orchestrator.service.ts

   Changes at lines 59-96:
   - Call initializeResearch() first to get logId
   - Emit research_start with { data: { logId } }
   - Call executeResearchWithLogId() for actual execution
   - Emit research_complete with { data: { logId } }
   - On error, emit research_complete with error field

   Verify: npm run lint && npm run build
   ```

   Task 1.4: Update Chat Stream Controller (depends on 1.1)
   ```
   /task Implement dual-channel SSE in chat-stream.controller.ts

   Context: Forward research progress events through chat SSE
   File: src/chat/chat-stream.controller.ts

   Changes:
   - Add heartbeat interval (10s) during research phase
   - On research_start with logId: setup listener for log.{logId} events
   - Transform research events to research_progress events
   - On research_complete: cleanup log listener and stop heartbeat
   - Add transformToProgressData() method (copy pattern from research-stream.controller.ts)

   Reference: src/research/research-stream.controller.ts for event transformation patterns
   Verify: npm run lint && npm run build
   ```

   **Phase 2: Frontend Changes (Sequential - has dependencies)**

   Task 2.1: Update Chat Stream Service (depends on Phase 1)
   ```
   /task Update chat-stream.service.ts for progress handling

   Context: Handle new research_progress and heartbeat events
   File: client/src/app/core/services/chat-stream.service.ts

   Changes:
   - Add signals: researchProgress, researchStage
   - Add event listeners for 'research_progress' and 'heartbeat'
   - CRITICAL: Call resetHeartbeat() on research_start, research_progress, heartbeat events
   - Increase heartbeatInterval from 30000 to 60000 (60s)
   - Add handleResearchProgressEvent() and handleHeartbeatEvent() methods
   - Update clearStream() to reset new signals

   Verify: cd client && npm run lint
   ```

   Task 2.2: Update Research Panel Service (depends on 2.1)
   ```
   /task Update research-panel.service.ts to accept forwarded events

   Context: Display progress from chat stream instead of separate SSE connection
   File: client/src/app/core/services/research-panel.service.ts

   Changes:
   - Add handleProgressFromChat(data) method
   - Update progress signals based on forwarded event data
   - Keep existing startResearchTracking() for backward compatibility

   Verify: cd client && npm run lint
   ```

   Task 2.3: Wire Up Chat Component (depends on 2.1, 2.2)
   ```
   /task Connect chat.component.ts to research progress

   Context: Display research progress in chat UI
   File: client/src/app/features/chat/chat.component.ts

   Changes:
   - Subscribe to chatStreamService research signals
   - Forward progress to researchPanelService
   - Auto-open research panel on research_start

   Verify: cd client && npm run lint && npm run build
   ```

   **Phase 3: Validation**

   Task 3.1: Backend Validation
   ```
   /task Validate backend changes

   Checks:
   1. npm run lint passes
   2. npm run build succeeds
   3. No TypeScript errors
   4. Review: event interface has all required types
   5. Review: orchestrator emits logId with research_start

   Report: Pass/fail for each check
   ```

   Task 3.2: Frontend Validation
   ```
   /task Validate frontend changes

   Checks:
   1. cd client && npm run lint passes
   2. cd client && npm run build succeeds
   3. No TypeScript errors
   4. Review: heartbeat resets on all research events

   Report: Pass/fail for each check
   ```

   Task 3.3: E2E Test (depends on 3.1, 3.2)
   ```
   /task E2E test chat + research integration

   Context: Verify the fix works end-to-end
   Prerequisites: Ollama running, PostgreSQL running

   Test scenario:
   1. Start dev server: npm run dev
   2. Navigate to chat: http://localhost:4200/chat
   3. Create conversation, enable research addon
   4. Send message that triggers research
   5. Verify: No timeout, progress events visible, response completes

   Success criteria:
   - SSE connection stays alive during research (>30s)
   - Research progress events received
   - Final response displays correctly

   Report: Test results with screenshots if possible
   ```

3. **Orchestrator Responsibilities**
   - Create TodoWrite with all 9 tasks
   - Spawn subagents for each task in dependency order
   - Update TodoWrite as tasks complete
   - Handle any failures by re-spawning or adjusting
   - Final validation before marking complete

## Task Dependencies

Phase 1 (Backend):
1.1 (interface) ─┬─→ 1.3 (orchestrator)
                 └─→ 1.4 (controller)
1.2 (research service) ─→ 1.3 (orchestrator)

Phase 2 (Frontend):
[Phase 1 complete] ─→ 2.1 (stream service) ─┬─→ 2.3 (component)
                                            └─→ 2.2 (panel service) ─→ 2.3

Phase 3 (Validation):
3.1 (backend) ─┐
3.2 (frontend) ┴─→ 3.3 (E2E)

## Parallel Opportunities
- Tasks 1.3 and 1.4 can run in parallel (both depend on 1.1)
- Tasks 2.1 and 2.2 can run in parallel after Phase 1
- Tasks 3.1 and 3.2 can run in parallel

## Success Criteria (from plan)
- [ ] No timeout during research - Chat SSE stays connected for 60+ seconds
- [ ] Real-time progress visible - Research panel shows live updates
- [ ] Graceful degradation - Research failures don't break chat
- [ ] E2E tests pass - Playwright verifies research+chat flow
```

---

## Quick Start

1. Copy the prompt above (everything between the triple backticks)
2. Paste into a new Claude Code session
3. The orchestrator will coordinate subagents for implementation
4. All code changes happen in subagents, preserving orchestrator context

## Files Modified by This Implementation

### Backend (4 files)
1. `src/chat/interfaces/chat-stream-event.interface.ts` - Add event types
2. `src/chat/chat-stream.controller.ts` - Dual channel listener + heartbeat
3. `src/chat/services/chat-orchestrator.service.ts` - LogId handling
4. `src/chat/services/chat-research.service.ts` - Split initialization

### Frontend (3 files)
1. `client/src/app/core/services/chat-stream.service.ts` - Progress handling
2. `client/src/app/core/services/research-panel.service.ts` - Accept forwarded events
3. `client/src/app/features/chat/chat.component.ts` - Wire up progress

## Related Documents

- **Design Plan:** `/home/mnh/.claude/plans/dynamic-wandering-cherny.md`
- **Project Guidelines:** `/home/mnh/projects/research-agent/CLAUDE.md`
- **Reference Implementation:** `src/research/research-stream.controller.ts` (working SSE pattern)
