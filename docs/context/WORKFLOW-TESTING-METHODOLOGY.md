# Workflow Testing Methodology - Research Agent

> Created: 2025-12-07
> Status: Active Testing Protocol
> Test Query: "What is happening in Aarhus next weekend?"

## CRITICAL RULES - READ BEFORE EVERY ACTION

### Rule 1: Errors MUST Be Fixed
Any error encountered is NOT a separate issue - it MUST be fixed before proceeding.

### Rule 2: Sequential Workflow Testing
- Follow the execution order of the system
- For each step, verify it works BEFORE moving to the next
- If a step fails → FIX IT before proceeding
- If a step succeeds → Move to next step

### Rule 3: Always Start from Beginning
When testing step N, you MUST:
1. Execute steps 1 through N-1 first
2. Use the actual output from previous steps as input
3. Never skip steps or use mocked data

### Rule 4: Test Query
**ALWAYS use this query**: `"What is happening in Aarhus next weekend?"`

Why this query:
- Temporal search (requires current date awareness)
- Location-specific (requires web search)
- LLM cannot answer from training data
- Has caused multiple failures historically

### Rule 5: Subagent Delegation
Identify distinct, isolated tasks and execute them in subagents to:
- Preserve main context window
- Enable parallel investigation
- Keep focused scope per task

### Rule 6: Final Validation (Playwright MCP)
Testing is NOT complete until browser validation confirms:
- [ ] Actual result is visible in the browser
- [ ] Tool calls count > 0 (0 = ERROR)
- [ ] Status is NOT "incomplete"
- [ ] Sources are displayed (count > 0)

## Research Agent Workflow Stages

### Stage 1: Query Submission
**Endpoint**: `POST /api/research/query`
**Input**: `{ "query": "What is happening in Aarhus next weekend?" }`
**Expected Output**: `{ "logId": "<uuid>" }`

**Verification**:
- Response returns 200/201
- logId is valid UUID
- No errors in server console

### Stage 2: Query Analysis & Planning
**Service**: `PlannerService.createPlan()`
**Expected Output**: Plan with phases and steps

**Verification**:
- Plan created successfully (check logs for "createPlan: After ensureSynthesisPhase - success")
- No 3230 errors
- Plan has search phase + synthesis phase

### Stage 3: Tool Execution - Search Phase
**Services**: `ToolExecutor`, Search tools (tavily, brave, serpapi, etc.)
**Expected Output**: Search results with URLs, titles, content

**Verification**:
- Search tools execute without errors
- Results contain actual data (not empty arrays)
- Multiple sources retrieved

### Stage 4: Tool Execution - Fetch Phase (if applicable)
**Services**: `ToolExecutor`, web_fetch tool
**Expected Output**: Fetched content from URLs

**Verification**:
- Fetch operations complete
- Content is retrieved successfully

### Stage 5: Source Extraction
**Service**: `ResultExtractorService.extractAllResults()`
**Expected Output**: Sources array with URLs, titles, relevance

**Verification**:
- Sources count > 0
- Check logs: "[ResultExtractor] extractAllResults returning X sources"

### Stage 6: Synthesis Phase
**Service**: `LLMExecutor`, LLMService
**Expected Output**: Synthesized answer from gathered sources

**Verification**:
- Synthesis completes (not stuck/hanging)
- Answer is generated
- No LLM errors

### Stage 7: Result Storage
**Service**: `ResearchResultService`
**Expected Output**: Result saved to database

**Verification**:
- Research result saved with sources
- Check via API: `GET /api/research/results/<logId>`

### Stage 8: Browser Validation (Final)
**Tool**: Playwright MCP
**Expected Output**: Complete result displayed in UI

**Verification**:
- Navigate to `http://localhost:4200`
- Submit test query
- Verify:
  - [ ] Result appears (not loading forever)
  - [ ] Tool calls shown > 0
  - [ ] Sources displayed
  - [ ] Status = "completed"
  - [ ] Answer text is visible and relevant

## Testing Approach

### Phase A: Backend API Testing
Execute stages 1-7 via curl/API calls:
```bash
# Stage 1: Submit query
curl -X POST http://localhost:3000/api/research/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is happening in Aarhus next weekend?"}'

# Wait for completion, then check results
curl http://localhost:3000/api/research/results/<logId>
```

### Phase B: Log Analysis
For each stage, check server logs:
```bash
# Watch for errors
tail -f logs/research-error.log

# Check combined logs for stage-specific messages
grep "<stage-keyword>" logs/research-combined.log
```

### Phase C: Browser Validation (Playwright MCP)
Final validation using browser automation:
1. Navigate to frontend
2. Enter test query
3. Wait for completion
4. Verify all success criteria

## Subagent Task Definitions

### Task 1: Backend Stage Testing
**Scope**: Stages 1-4 (Query submission through search execution)
**Isolation**: Can run independently
**Output**: Log of each stage's success/failure, error details if any

### Task 2: Source Extraction Verification
**Scope**: Stage 5
**Isolation**: Requires completed Stage 4 output
**Output**: Source count, extraction logs, any errors

### Task 3: Synthesis Verification
**Scope**: Stage 6
**Isolation**: Requires completed Stage 5 output
**Output**: Synthesis completion status, timing, errors

### Task 4: Result Storage Verification
**Scope**: Stage 7
**Isolation**: Requires completed Stage 6
**Output**: Database record verification

### Task 5: Browser E2E Validation
**Scope**: Stage 8
**Isolation**: Requires backend running and responding
**Output**: Screenshot evidence, pass/fail on all criteria

## Error Handling Protocol

When an error is encountered:

1. **Document**: Record exact error message, stage, and context
2. **Isolate**: Identify the specific component causing the error
3. **Investigate**: Use subagent to trace root cause
4. **Fix**: Implement the fix
5. **Verify**: Re-run from Stage 1 to confirm fix works
6. **Continue**: Proceed to next stage only after verification

## Context Reminder Checkpoints

Insert this reminder after every 3-4 tool calls:

```
REMINDER: Testing "What is happening in Aarhus next weekend?"
- Current Stage: [X]
- Previous stages verified: [1, 2, ...]
- Any errors must be fixed before proceeding
- Final validation: Playwright browser test required
```

## Success Criteria Summary

A successful test run requires ALL of the following:

| Stage | Criteria |
|-------|----------|
| 1 | logId returned |
| 2 | Plan created, no 3230 errors |
| 3 | Search results retrieved (count > 0) |
| 4 | Fetch completed (if applicable) |
| 5 | Sources extracted (count > 0) |
| 6 | Synthesis completed, answer generated |
| 7 | Result saved to database |
| 8 | Browser shows: result visible, tool calls > 0, status = completed |

## Files to Monitor

- `logs/research-combined.log` - All activity
- `logs/research-error.log` - Errors only
- Server console output - Real-time feedback
- Database: `research_results` table

---

**REMEMBER**: This document defines the testing protocol. Read it at the start of each session and refer back when encountering issues.
