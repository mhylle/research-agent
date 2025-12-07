# Context: Azure Mistral Tool Calling & Source Extraction - VERIFIED WORKING

> Saved: 2025-12-07T09:20:00Z
> Session: Sprint 3-4 debugging continuation
> Status: completed

## Trajectory

**Goal**: Fix Azure Mistral 3230 tool calling errors that were causing source extraction to return 0 sources in research results.

**Success Criteria**:
- No 3230 "Not the same number of function calls and responses" errors
- Research queries return sources (not 0)
- Tool calling cycle works correctly with Azure Mistral provider

**Current Phase**: completed - fix verified working

## Problem Statement

Research queries were returning 0 sources despite successful web searches. The root cause was Azure Mistral API error 3230 caused by a race condition in PlannerService where shared instance state (`this.currentMessages`) was being corrupted by concurrent sub-query execution.

## Resolution Summary

### What Was Fixed (Previous Session - Commit edc1a3b)

1. **Race condition in PlannerService**: Replaced shared `this.currentMessages` with local variable scoping
2. **Message validation in AzureMistralProvider**: Added `debugTraceToolCallBalance()` to validate tool call/response ordering before API calls
3. **Multi-provider LLM abstraction**: Added support for switching between Ollama and Azure Mistral

### Verification Results (This Session)

| Query | Created | Sources | Status |
|-------|---------|---------|--------|
| TypeScript 5.7 release date | 08:08:43 AM (after fix) | **14** | Completed |
| Node.js version (old) | 07:32:15 AM (before fix) | 0 | Expected |
| CES 2025 AI | 07:53 AM (before fix) | 0 | 3230 errors |

## Active Code Focus

### Primary Files (Fixed)

| File | Lines | Status |
|------|-------|--------|
| `src/llm/providers/azure-mistral.provider.ts` | 115-196 | Fixed - debugTraceToolCallBalance() validates message ordering |
| `src/orchestration/services/result-extractor.service.ts` | 35-116 | Working - extractAllResults() correctly processes sources |
| `src/orchestration/orchestrator.service.ts` | 449-534, 660-810 | Working - executePlan() returns sources correctly |

### Key Code - Message Validation (azure-mistral.provider.ts:115-196)

```typescript
// Validates tool call / response balance AND ordering before Azure API call
private debugTraceToolCallBalance(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): void {
  // Verify ordering: each assistant message with tool_calls must be followed
  // by exactly those tool responses
  const orderingErrors: string[] = [];
  // ... validation logic
  if (orderingErrors.length > 0) {
    throw new Error(`Message ordering validation failed: ${orderingErrors[0]}`);
  }
}
```

### Key Code - Source Extraction (result-extractor.service.ts:35-116)

```typescript
extractAllResults(phaseResult: PhaseResult): { sources: Source[]; output: string; } {
  const sourceMap = new Map<string, Source>();
  // Single pass through step results to extract both sources and output
  for (const stepResult of phaseResult.stepResults) {
    if (Array.isArray(stepResult.output)) {
      for (const item of stepResult.output) {
        if (this.isSearchResultItem(item)) {
          sourceMap.set(item.url, { url: item.url, title: item.title, relevance });
        }
      }
    }
  }
  return { sources: Array.from(sourceMap.values()), output: synthesisOutput || '' };
}
```

## Decisions Made

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| Local variable scoping in PlannerService | Eliminates race condition with concurrent sub-queries | Mutex/lock (more complex), singleton pattern (doesn't solve concurrency) |
| Pre-API validation in provider | Catches errors before Azure API call with clear diagnostics | Post-error handling (less clear error messages) |
| Message ordering throw vs warn | Prevents sending invalid requests to Azure | Warning-only (would still get 3230 errors) |

## Approaches Taken

### Succeeded
- **Race condition fix**: Local variable scoping eliminated shared state corruption
- **Message validation**: debugTraceToolCallBalance() catches ordering issues before API call
- **Source extraction**: Pipeline correctly processes search results through stepResults

### Failed/Abandoned
- **Initial debugging**: Looking at ResultExtractorService first (symptoms, not cause)
- **Old query analysis**: Queries from before fix will never show sources (expected)

## Verification Evidence

From server logs:
```
[ResultExtractor] extractAllResults returning 12 sources, output length=...
[Orchestrator] executePlan returning 14 sources
```

From database:
```json
{
  "logId": "27797c70-a6c0-40e4-af6f-9f22a3d1b6a5",
  "query": "What is TypeScript 5.7 release date?",
  "sources_count": 14
}
```

## Environment Notes

- Server restart at 8:53 AM applied the fixes
- Old queries in database from before restart still show 0 sources (expected)
- New queries after restart show correct source counts
- LLM Provider: Azure Mistral (LLM_PROVIDER=azure-mistral)

## Related Documentation

- Previous context file: `docs/context/CONTEXT-llm-provider-tool-execution.md`
- Commit with fix: edc1a3b "feat(llm): add multi-provider LLM abstraction with Azure Mistral support"

## Known Issues (Separate from Source Extraction)

1. **Synthesis phase stalling**: Some queries hang during LLM synthesis (not related to source extraction)
2. **Embedding service 500 errors**: EmbeddingService fails occasionally (non-blocking)

## Next Steps (If Issues Recur)

1. Check server logs for 3230 errors: `grep "3230" logs/research-error.log`
2. Verify message ordering in debugTraceToolCallBalance output
3. Ensure LLM_PROVIDER is set correctly in .env
4. Check for new race conditions if sub-query execution pattern changes

---
*Resume command*: `The Azure Mistral tool calling and source extraction fix has been verified working. TypeScript 5.7 query shows 14 sources. No further action needed unless 3230 errors recur.`
