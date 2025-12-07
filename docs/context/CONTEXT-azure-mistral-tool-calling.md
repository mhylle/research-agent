# Context: Azure Mistral Tool Calling & Source Extraction Investigation

> Saved: 2025-12-07T08:45:00
> Session: sprint3-4-core-agentic (continuation)
> Status: in-progress

## Trajectory

**Goal**: Fix Azure Mistral LLM provider tool calling so research queries execute properly with web search tools (Tavily) and return sources in the final result.

**Success Criteria**:
- No Azure API error 3230 ("Not the same number of function calls and responses")
- Research queries complete with `sourcesCount > 0`
- Tool calls (tavily_search) execute and return results
- Sources propagate through the pipeline to final ResearchResult

**Current Phase**: debugging - tool calling errors fixed, source propagation still failing

## Problem Statement

Azure Mistral API requires strict message ordering: assistant messages with `tool_calls` must be IMMEDIATELY followed by exactly N tool response messages (where N = number of tool_calls). The previous session fixed the planner.service.ts to ensure this ordering, but sources are still showing as 0 in final results despite tavily_search returning valid results. This is the SAME issue manifesting at different points in the pipeline - the tool call flow is not fully working end-to-end.

## Active Code Focus

### Primary Files

| File | Lines | Reason |
|------|-------|--------|
| `src/llm/providers/azure-mistral.provider.ts` | 80-152 | Debug logging added to trace message ordering |
| `src/orchestration/planner.service.ts` | 155-213, 529-567 | Previous session's fix for tool call message ordering |
| `src/orchestration/orchestrator.service.ts` | 310-439, 444-532, 620-800 | executeDecomposedQuery, executeSubQuery, executePlan - source accumulation |
| `src/orchestration/services/result-extractor.service.ts` | 35-116 | extractAllResults - where sources should be extracted from step outputs |

### Key Code Context

```typescript
// src/llm/providers/azure-mistral.provider.ts:85-152
// Debug method that validates message ordering before API call
private debugTraceToolCallBalance(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): void {
  // Prints full message sequence
  console.log(`[AzureMistral DEBUG] Full message sequence (${messages.length} messages):`);
  // ... logs each message type and tool_call IDs

  // Verifies ordering: each assistant with tool_calls must be followed by matching tool responses
  // Reports "ORDERING ERRORS DETECTED" or "Message ordering OK"
}
```

```typescript
// src/orchestration/orchestrator.service.ts:355-361
// Sub-query source accumulation - THIS IS WHERE SOURCES ARE LOST
console.log(
  `[Orchestrator] Sub-query ${subQuery.id} returned ${result.sources.length} sources, adding to allSources`,
);
allSources.push(...result.sources);
console.log(
  `[Orchestrator] allSources now has ${allSources.length} sources`,
);
// Logs show: "returned 0 sources" despite tavily_search having valid results
```

```typescript
// src/orchestration/services/result-extractor.service.ts:54-77
// Source extraction from step results
if (Array.isArray(stepResult.output)) {
  for (const item of stepResult.output) {
    if (this.isSearchResultItem(item)) {
      // Expects: { url: string, title: string, content: string, score?: number }
      sourceMap.set(item.url, { url, title, relevance });
    }
  }
}
```

### Dependencies & Relationships

- `OrchestratorService` → `PlannerService` → `LLMService` → `AzureMistralProvider` for tool calling
- `OrchestratorService.executeSubQuery()` → `executePlan()` → `ResultExtractorService.extractAllResults()`
- Tool execution: `ToolRegistryService` → `TavilySearchProvider` → returns `{ url, title, content, score }`

## Decisions Made

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| Add debug logging in azure-mistral.provider.ts | Need to trace exact message sequence causing API errors | Adding logging in planner (already done in previous session) |
| Check message ordering, not just totals | Azure requires ORDERING not just count balance | Simple count check passed but errors still occurred |
| Keep investigating source flow as SAME issue | Sources=0 despite tools working means pipeline is broken end-to-end | Treating as "separate issue" (rejected - it's connected) |

## Approaches Taken

### Succeeded
- **Debug logging**: Added `debugTraceToolCallBalance()` in azure-mistral.provider.ts - shows message ordering is now correct
- **Message ordering validation**: Enhanced debug shows "Message ordering OK" for all recent queries
- **Previous session's planner fix**: Confirmed the fix at planner.service.ts:155-213 is in place and working

### Failed/Abandoned
- None explicitly, but treating source extraction as "separate" was wrong approach

### In Progress
- **Source propagation investigation**: tavily_search returns valid results in step_completed events, but:
  - `executePlan` sometimes returns 0 sources
  - Sub-queries consistently return 0 sources to `executeDecomposedQuery`
  - The extraction pipeline loses sources somewhere between tool output and final result

## User Requirements

> "I see that the last 2 tests you made had 0 tool calls and 0 stages, that does not look like you succeeded"
>
> "Tests should use queries requiring 2025 web search (not LLM knowledge)"
>
> "Verify the pipeline is actually using tools (Tavily search)"
>
> "any errors are not a separate issue, this is never so, NEVER" - sources=0 IS part of the same tool calling issue

## Blockers & Open Questions

- [ ] **Why does executePlan return 0 sources for sub-queries?** The ResultExtractorService should find tavily_search results
- [ ] **Is phaseResult.stepResults populated correctly?** The extraction expects stepResult.output to be an array with {url,title,content}
- [ ] **Are step_completed events writing to phaseResult?** There may be a disconnect between event logging and actual result storage
- [ ] **Is the plan structure different for sub-queries?** Sub-query plans may not have phases that trigger source extraction

## Next Steps

1. **Add debug logging to ResultExtractorService.extractAllResults()** at `src/orchestration/services/result-extractor.service.ts:48` to see what phaseResult contains
2. **Trace phaseResult.stepResults** in `executePlan()` at `src/orchestration/orchestrator.service.ts:678` - verify stepResults have output arrays
3. **Check if sub-query plans have retrieval phases** - the plan structure may differ from main query plans
4. **Verify isSearchResultItem() matching** - ensure tavily output format matches expected `{url, title, content}` interface
5. **Run test with logging enabled** - query: "What is the latest Node.js version in December 2025?"

## Session Notes

### Debug Output Pattern (Working)
```
[AzureMistral DEBUG] Full message sequence (8 messages):
[AzureMistral DEBUG] Message ordering OK
```

### Source Loss Pattern (Problem)
```
[Orchestrator] Sub-query sq-xxx returned 0 sources, adding to allSources
[Orchestrator] allSources now has 0 sources
```

### Tavily Results Present in Logs
```json
{
  "toolName": "tavily_search",
  "outputType": "array",
  "sample": [{ "url": "...", "title": "...", "content": "...", "score": 0.99 }]
}
```
This proves tools ARE returning results - the issue is in how they're captured/extracted.

### Environment
- Branch: `feat/sprint3-4-core-agentic`
- LLM: Azure Mistral (`LLM_PROVIDER=azure-mistral`)
- Backend: localhost:3000
- Database: PostgreSQL on port 5433

### Files Modified (uncommitted)
- `src/llm/providers/azure-mistral.provider.ts` - Added debug logging

---
*Resume command*: `Continue debugging tool call source extraction. Read docs/context/CONTEXT-azure-mistral-tool-calling.md first. The tool calling API errors are FIXED but sources=0 because results aren't propagating through the pipeline. Trace from tavily_search output through ResultExtractorService to find where sources are lost.`
