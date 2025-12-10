# Brainstorm: E2E Test Suite with Playwright MCP Subagents

**Date**: 2025-01-10
**Status**: Ready for Planning

## Executive Summary

Design a comprehensive E2E test suite using Playwright MCP that can be executed via parallel subagents. Each vertical tests a specific functional area, comparing actual behavior against the implementation plan documents. The suite will produce structured reports (JSON + Markdown) suitable for both human review and automated defect fixing.

## Idea Evolution

### Original Concept
Create Playwright MCP-based E2E tests that can run in subagents, testing vertical functionalities of the chat-with-research-addon feature. Special focus on the research side panel which wasn't appearing during manual testing.

### Refined Understanding
Through Socratic exploration, we clarified:
- **Comprehensive testing** with full LLM response waits (no shortcuts)
- **Reference-based approach** where subagents read plan documents as test oracles
- **Hybrid coordination** with orchestrator subagent + artifact-based communication
- **Structured reports** in JSON (for automation) + Markdown (for human review)
- **5 test verticals** at appropriate granularity

### Key Clarifications Made
- Tests do NOT validate LLM response quality, only that responses arrive
- Plan and brainstorm documents are authoritative (not context doc)
- 60-second timeouts for LLM operations with "slow but working" distinction
- Both isolated and collaborative tests needed (hybrid approach)

## Analysis Results

### Strengths (Yellow Hat)
- All implementation pieces exist - components, services, event handlers are built
- Event architecture is sound - EventEmitter2 → SSE → Signals pattern works
- Plan documents have detailed success criteria for test oracles
- Subagent model fits naturally - each vertical is independent

### Risks & Concerns (Black Hat + Premortem)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tests pass but miss broken features | High | High | Include negative tests verifying specific plan behaviors |
| Subagents timeout waiting for LLM | Medium | High | 60-second timeouts with graceful "slow but working" handling |
| Test reports too verbose to act on | Medium | Medium | Structured JSON with severity + concise markdown summary |
| Orchestrator loses track of state | Low | High | Artifact files for inter-subagent communication |
| Research panel bugs remain unfound | High | High | Dedicated vertical with plan-extracted checklist |

### Gaps Identified (From Codebase Research)

- [ ] **`research_start` event missing `logId`** - Backend emits event without the logId needed for progress tracking (`chat-orchestrator.service.ts:61-64`)
- [ ] **Panel open triggered at wrong time** - Code checks `userMessage.researchLogId` immediately after creation when it's still NULL (`chat.component.ts:189`)
- [ ] **Citations not populated in panel** - No mechanism loads citations into `researchPanelService.citations` signal
- [ ] **`isResearchActive` signal unused** - Signal updated by events but no effect consumes it
- [ ] **Knowledge graph not integrated** - Plan specifies D3.js visualization in side panel, not implemented

### Enhancement Opportunities (SCAMPER)

- **Substitute**: Use plan documents as test oracles instead of hardcoded expectations
- **Combine**: Gap analysis + E2E testing - report both functional issues AND plan deviations
- **Adapt**: Use existing research SSE testing patterns for chat SSE verification
- **Modify**: Capture screenshots at each step for visual evidence
- **Put to other use**: Test reports become defect tickets with file:line references
- **Eliminate**: Auto-extract requirements from plan, no manual reading needed
- **Reverse**: Test error handling before happy paths to find edge cases first

### Premortem Findings

- **Failure mode**: Tests pass but features broken → **Prevention**: Negative tests from plan criteria
- **Failure mode**: Flaky timing issues → **Prevention**: Explicit SSE event waits, not arbitrary delays
- **Failure mode**: Reports overwhelming → **Prevention**: Severity levels, executive summary
- **Failure mode**: Subagent coordination fails → **Prevention**: Artifact-based state + orchestrator retries

## Structured Concept

### Component 1: Test Orchestrator Prompt

**Purpose**: Coordinate test execution, manage shared resources, aggregate results
**Scope**: Spawns vertical subagents, creates shared artifacts, produces final report
**Dependencies**: Access to Playwright MCP, file system for artifacts
**Key Decisions**:
- Creates conversation for collaborative tests before spawning subagents
- Writes conversation ID to artifact file for subagents to read
- Waits for all subagents, then aggregates JSON results into final report

### Component 2: Test Vertical - Conversation Management

**Purpose**: Test CRUD operations on conversations
**Scope**: Create, list, search, delete, update title
**Dependencies**: None (isolated tests)
**Tests**:
1. Create new conversation → verify in list
2. Search conversations → verify filtering
3. Update conversation title → verify persistence
4. Delete conversation → verify removal
5. List with pagination → verify page navigation

### Component 3: Test Vertical - Chat Messaging

**Purpose**: Test message sending and streaming
**Scope**: Send message, receive streaming response, multi-turn context
**Dependencies**: Uses orchestrator-created conversation (collaborative)
**Tests**:
1. Send message → verify user message appears
2. Wait for streaming → verify tokens arrive via SSE
3. Verify assistant response displayed
4. Send follow-up → verify context maintained
5. Verify message timestamps and metadata

### Component 4: Test Vertical - Research Integration (CRITICAL)

**Purpose**: Test research toggle, side panel, citations, progress
**Scope**: Full research flow from toggle to citations display
**Dependencies**: Uses orchestrator-created conversation (collaborative)
**Tests** (from plan document):
1. Toggle research button → verify visual state change
2. Send message with research enabled → verify `research_start` event
3. Verify side panel opens automatically
4. Verify progress indicator shows stages
5. Wait for `research_complete` event
6. Verify citations appear in panel
7. Click inline citation → verify panel highlights source
8. Verify source details (title, URL, snippet)

**Expected Failures** (from codebase analysis):
- Panel does NOT open automatically (bug: `researchLogId` NULL at check time)
- Progress indicator does NOT show (bug: `logId` not in `research_start` event)
- Citations NOT populated in panel (bug: no mechanism to load them)

### Component 5: Test Vertical - Mobile Responsiveness

**Purpose**: Test responsive design at mobile viewport
**Scope**: Sidebar toggle, touch targets, bottom sheet
**Dependencies**: None (isolated tests)
**Tests**:
1. Resize to 375x667 → verify hamburger menu appears
2. Click toggle → verify sidebar opens
3. Select conversation → verify sidebar closes
4. Verify touch targets ≥44px
5. (If research panel worked) Verify bottom sheet layout

### Component 6: Test Vertical - Error Handling

**Purpose**: Test connection loss, retry, error display
**Scope**: Network errors, reconnection, user feedback
**Dependencies**: None (isolated tests)
**Tests**:
1. Simulate connection drop → verify reconnection attempt
2. Verify error message displayed to user
3. Test retry button functionality
4. Verify connection status indicator
5. Verify graceful degradation (chat still usable)

### Component 7: Report Structure

**Purpose**: Structured output for human review and automation
**Scope**: JSON data + Markdown summary + screenshots

**Directory Structure**:
```
docs/test-reports/
├── YYYY-MM-DD-e2e-summary.md     # Human-readable summary
├── YYYY-MM-DD-e2e-results.json   # Structured data
└── screenshots/                   # Visual evidence
    ├── conversation-list.png
    ├── chat-streaming.png
    ├── research-panel-expected.png
    ├── research-panel-actual.png
    └── mobile-sidebar.png
```

**JSON Schema**:
```json
{
  "testRun": {
    "date": "2025-01-10T...",
    "duration": "5m 32s",
    "status": "FAILED"
  },
  "summary": {
    "total": 25,
    "passed": 18,
    "failed": 5,
    "skipped": 2
  },
  "verticals": [
    {
      "name": "Research Integration",
      "status": "FAILED",
      "tests": [
        {
          "name": "Side panel opens automatically",
          "status": "FAILED",
          "expected": "Panel opens when research_start received",
          "actual": "Panel never opened",
          "planReference": "Phase 9 success criteria",
          "codeReference": "chat.component.ts:189",
          "screenshot": "screenshots/research-panel-actual.png",
          "suggestedFix": "Move panel open to research_start event handler"
        }
      ]
    }
  ],
  "planDeviations": [
    {
      "requirement": "Research progress displays during active research",
      "planned": "docs/plans/2025-01-09-chat-with-research-addon.md",
      "status": "NOT_WORKING",
      "rootCause": "logId not included in research_start event"
    }
  ]
}
```

## Research Findings

### Codebase Analysis - Critical Integration Issues

**Issue 1: Research Panel Never Opens Automatically**
- Location: `chat.component.ts:189`
- Problem: Code checks `userMessage.researchLogId` immediately after creation
- At this point, `researchLogId` is NULL (backend sets it later during research)
- `startResearchTracking()` is never called
- Impact: Users never see research progress or citations panel

**Issue 2: Missing logId in research_start Event**
- Location: `chat-orchestrator.service.ts:61-64`
- Problem: Event emitted without including the generated logId
- Frontend tries to read `data.logId` but it's not present
- Impact: No way to connect chat stream to research progress stream

**Issue 3: Disconnect Between Research Events and Panel**
- Research progress emits to `/api/research/stream/${logId}`
- Chat stream at `/api/chat/stream/:messageId` only has `research_start`/`research_complete`
- Panel's `startResearchTracking()` is never invoked
- Impact: Progress bar and stage indicators never update

**Issue 4: Citations Not Displayed in Panel**
- Citations saved to message entity after research completes
- No mechanism populates `researchPanelService.citations` signal
- Panel shows empty state even when citations exist in database
- Impact: Users cannot see research sources

### Plan Document Requirements (Authoritative)

From `docs/plans/2025-01-09-chat-with-research-addon.md`:

**Phase 9 Success Criteria**:
- [ ] Inline citations render as clickable numbers
- [ ] Clicking citation opens side panel
- [ ] Side panel shows source details (title, URL, snippet)
- [ ] Research progress displays during active research
- [ ] Panel collapses/expands correctly
- [ ] Mobile layout uses bottom sheet
- [ ] Knowledge graph visualization displays in side panel

**Phase 6 Success Criteria**:
- [x] Research receives contextualized query
- [x] Citations correctly extracted from research results
- [x] Message linked to research via `researchLogId` field
- [ ] Concurrent research requests queued properly (untested)

## Recommended Next Steps

1. **Create orchestrator prompt template** with artifact coordination
2. **Create 5 vertical test prompts** with plan-extracted test cases
3. **Implement report aggregation logic** in orchestrator
4. **Run test suite** to validate findings and discover additional issues
5. **Fix identified bugs** based on test report

## Ready for Create-Plan
**Yes**

The concept is well-defined and ready for implementation planning.

### Suggested Plan Scope
- Primary deliverables: 6 prompt templates (1 orchestrator + 5 verticals)
- Key phases: Prompt creation → Integration test → Report aggregation
- Critical success factors: Research vertical must detect known bugs, reports must be actionable

---

## Appendix: Subagent Prompt Templates

### Orchestrator Prompt Template

```
You are the E2E Test Orchestrator for the research_agent chat feature.

SETUP:
1. Read the implementation plan: docs/plans/2025-01-09-chat-with-research-addon.md
2. Read the brainstorm for requirements: docs/brainstorms/2025-01-09-chat-with-research-addon.md
3. Navigate to http://localhost:4200/chat using Playwright MCP
4. Create a new conversation for collaborative tests
5. Write the conversation ID to /tmp/e2e-test-conversation-id.txt

SPAWN SUBAGENTS:
Launch the following test verticals in parallel using Task tool:
- conversation-management-tests (isolated)
- chat-messaging-tests (uses shared conversation)
- research-integration-tests (uses shared conversation)
- mobile-responsiveness-tests (isolated)
- error-handling-tests (isolated)

AGGREGATE RESULTS:
1. Wait for all subagents to complete
2. Read JSON results from /tmp/e2e-results-*.json
3. Aggregate into final report
4. Write summary to docs/test-reports/YYYY-MM-DD-e2e-summary.md
5. Write full results to docs/test-reports/YYYY-MM-DD-e2e-results.json

REPORT FORMAT:
Include for each failed test:
- Test name and vertical
- Expected behavior (from plan)
- Actual behavior observed
- File:line reference for likely bug location
- Suggested fix approach
- Screenshot path if captured
```

### Research Integration Vertical Prompt Template

```
You are testing the Research Integration feature of the chat application.

CONTEXT:
- Read conversation ID from /tmp/e2e-test-conversation-id.txt
- Navigate to that conversation at http://localhost:4200/chat/{id}

AUTHORITATIVE REQUIREMENTS (from plan):
- Side panel should open automatically when research starts
- Progress indicator should show stages: Planning → Phases → Complete
- Citations should display with title, URL, snippet
- Inline citation clicks should highlight source in panel

TESTS TO EXECUTE:

1. TOGGLE RESEARCH BUTTON
   - Find the Research toggle button
   - Click it and verify visual state changes
   - Take screenshot: research-toggle-enabled.png

2. SEND MESSAGE WITH RESEARCH
   - Type: "Why is the sky blue? Give a detailed scientific explanation."
   - Click Send
   - Monitor console for 'research_start' event
   - Expected: Event should include logId
   - Take screenshot: research-started.png

3. VERIFY SIDE PANEL OPENS
   - Check if research-side-panel element is visible
   - Expected: Panel should open automatically
   - KNOWN BUG: Panel does NOT open (chat.component.ts:189)
   - Take screenshot: research-panel-state.png

4. VERIFY PROGRESS INDICATOR
   - Check for progress bar visibility
   - Check for stage text ("Planning...", "Phase: X", etc.)
   - Expected: Progress should update in real-time
   - KNOWN BUG: Progress never shows (logId not in event)
   - Take screenshot: research-progress.png

5. WAIT FOR COMPLETION
   - Wait up to 60 seconds for 'research_complete' event
   - Monitor console for event
   - Take screenshot: research-completed.png

6. VERIFY CITATIONS IN PANEL
   - Check for citations list in panel
   - Expected: Sources with title, URL, snippet
   - KNOWN BUG: Citations not populated
   - Take screenshot: research-citations.png

7. TEST INLINE CITATIONS (if response has them)
   - Look for [1], [2] etc. in assistant response
   - Click citation if present
   - Expected: Panel highlights corresponding source
   - Take screenshot: inline-citation-click.png

OUTPUT:
Write results to /tmp/e2e-results-research-integration.json with:
- Test name, status (PASS/FAIL/SKIP)
- Expected vs actual behavior
- Plan reference for requirement
- Code reference for likely bug location
- Screenshot paths
- Suggested fix for failures
```

### Chat Messaging Vertical Prompt Template

```
You are testing the Chat Messaging feature of the chat application.

CONTEXT:
- Read conversation ID from /tmp/e2e-test-conversation-id.txt
- Navigate to http://localhost:4200/chat/{id}

TESTS TO EXECUTE:

1. SEND USER MESSAGE
   - Type: "What is 2+2? Answer briefly."
   - Click Send button
   - Verify user message appears in thread
   - Take screenshot: user-message-sent.png

2. VERIFY SSE STREAMING
   - Monitor console for 'token' events
   - Verify tokens arrive incrementally
   - Wait for 'done' event (up to 60 seconds)
   - Take screenshot: streaming-in-progress.png

3. VERIFY ASSISTANT RESPONSE
   - Check assistant message appears after streaming
   - Verify content is not empty
   - Take screenshot: assistant-response.png

4. TEST MULTI-TURN CONTEXT
   - Send follow-up: "Multiply that by 3"
   - Wait for response
   - Expected: Response should reference previous answer (12)
   - Take screenshot: multi-turn-response.png

5. VERIFY MESSAGE METADATA
   - Check timestamps displayed
   - Check message roles (user/assistant) visually distinct
   - Take screenshot: message-metadata.png

OUTPUT:
Write results to /tmp/e2e-results-chat-messaging.json
```

### Conversation Management Vertical Prompt Template

```
You are testing Conversation Management in the chat application.

CONTEXT:
- Navigate to http://localhost:4200/chat (fresh, no conversation selected)

TESTS TO EXECUTE:

1. CREATE NEW CONVERSATION
   - Click "New Chat" button
   - Type and send a message to create conversation
   - Verify conversation appears in sidebar
   - Take screenshot: new-conversation-created.png

2. LIST CONVERSATIONS
   - Verify conversation list shows recent conversations
   - Check each item has title, date, token count
   - Take screenshot: conversation-list.png

3. SEARCH CONVERSATIONS
   - Type in search box
   - Verify list filters appropriately
   - Clear search, verify list restores
   - Take screenshot: conversation-search.png

4. SELECT DIFFERENT CONVERSATION
   - Click on a different conversation in list
   - Verify URL changes to include conversation ID
   - Verify messages load for selected conversation
   - Take screenshot: conversation-selected.png

5. DELETE CONVERSATION
   - Click delete button on a conversation
   - Verify conversation removed from list
   - Take screenshot: conversation-deleted.png

OUTPUT:
Write results to /tmp/e2e-results-conversation-management.json
```

### Mobile Responsiveness Vertical Prompt Template

```
You are testing Mobile Responsiveness of the chat application.

TESTS TO EXECUTE:

1. RESIZE TO MOBILE
   - Set viewport to 375x667 (iPhone SE)
   - Take screenshot: mobile-viewport.png

2. VERIFY HAMBURGER MENU
   - Check for hamburger menu button (☰)
   - Verify sidebar is hidden by default
   - Take screenshot: mobile-sidebar-hidden.png

3. TOGGLE SIDEBAR
   - Click hamburger menu
   - Verify sidebar opens
   - Take screenshot: mobile-sidebar-open.png

4. SELECT CONVERSATION
   - Click on a conversation
   - Verify sidebar closes automatically
   - Verify chat loads
   - Take screenshot: mobile-conversation-selected.png

5. VERIFY TOUCH TARGETS
   - Check button sizes are ≥44px
   - Check input fields are accessible
   - Take screenshot: mobile-touch-targets.png

6. RESTORE DESKTOP
   - Set viewport to 1280x800
   - Verify layout adapts back
   - Take screenshot: desktop-restored.png

OUTPUT:
Write results to /tmp/e2e-results-mobile-responsiveness.json
```

### Error Handling Vertical Prompt Template

```
You are testing Error Handling in the chat application.

TESTS TO EXECUTE:

1. VERIFY CONNECTION STATUS INDICATOR
   - Navigate to chat
   - Check for connection status display
   - Take screenshot: connection-status.png

2. TEST STREAMING ERROR RECOVERY
   - Send a message
   - Monitor for any error events
   - If error, verify user-friendly message displayed
   - Verify retry option available
   - Take screenshot: error-handling.png

3. VERIFY ERROR MESSAGES
   - Check error messages are user-friendly (not technical)
   - Verify error can be dismissed
   - Take screenshot: error-message.png

4. TEST RECONNECTION
   - If disconnected, verify auto-reconnection attempts
   - Check console for reconnection logs
   - Take screenshot: reconnection-attempt.png

OUTPUT:
Write results to /tmp/e2e-results-error-handling.json
```
