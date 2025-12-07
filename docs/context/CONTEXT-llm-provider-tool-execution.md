# Context: LLM Provider Abstraction & Tool Execution Investigation

> Saved: 2025-12-06T23:15:00
> Session: sprint3-4-core-agentic
> Status: in-progress

## Trajectory

**Goal**: Complete multi-provider LLM abstraction (Ollama + Azure Mistral) with verified tool calling execution in the research pipeline.

**Success Criteria**:
- Research queries execute tool calls (Tavily search) and return sources
- Both LLM providers (Ollama, Azure Mistral) complete full research pipeline
- Session results stored in database with valid UUIDs and source citations
- E2E browser test validates full flow with 2025 web queries

**Current Phase**: debugging

## Problem Statement

Azure Mistral LLM provider implementation is complete (Phases 1-5), but research sessions are showing **0 tool calls and 0 stages** with `sourcesCount: 0`. The synthesis appears to complete, but may be using LLM knowledge rather than actual web research. Need to verify the tool execution pipeline is functioning correctly.

## Active Code Focus

### Primary Files

| File | Lines | Reason |
|------|-------|--------|
| `src/orchestration/orchestrator.service.ts` | 312-380, 1115-1180, 1576-1650 | UUID fix applied, pipelineType metadata added - verify tool calls flow |
| `src/llm/providers/azure-mistral.provider.ts` | full | New provider - verify tool call handling |
| `src/llm/llm-provider.factory.ts` | full | Provider selection logic |
| `src/orchestration/planner.service.ts` | tool response sections | Must include tool_call_id for Azure Mistral |

### Key Code Context

```typescript
// src/orchestration/orchestrator.service.ts:312-340
// executeDecomposedQuery - UUID fix applied, now generates valid planId
async executeDecomposedQuery(query: string, logId: string): Promise<ResearchResult> {
  const planId = randomUUID(); // FIX: Was `decomposed-${logId}` (invalid UUID)
  // ... decomposition and sub-query execution
  return {
    planId,
    metadata: {
      pipelineType: 'decomposed', // NEW: Track pipeline type
      // ...
    }
  };
}
```

```typescript
// src/llm/providers/azure-mistral.provider.ts:key-sections
// Azure Mistral requires: no null values, tool_call_id in responses
private sanitizeOptions(options: ChatOptions): Record<string, any> {
  return Object.fromEntries(
    Object.entries(options || {}).filter(([_, v]) => v != null)
  );
}
```

### Dependencies & Relationships

- `LLMService` uses `LLMProviderFactory` to get provider based on `LLM_PROVIDER` env var
- `OrchestratorService` → `PlannerService` → `LLMService` for tool calling
- `PlannerService` must include `tool_call_id` when returning tool results to Azure Mistral
- Tool execution: `ToolRegistryService` → `tavily_search`, `web_fetch`, etc.

## Decisions Made

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| Provider Interface + Factory pattern | Allows runtime switching, clean abstraction | Direct provider injection (less flexible) |
| Keep OllamaService as backward-compat wrapper | Preserve existing injection sites during transition | Full replacement (breaking change) |
| Store pipelineType in metadata | Track which pipeline executed without changing DB schema | Add new column (migration overhead) |
| Use OpenAI SDK for Azure Mistral | Official compatibility layer for Azure endpoints | Direct REST calls (more code) |

## Approaches Taken

### Succeeded
- **UUID fix**: Changed `planId: \`decomposed-${logId}\`` to `randomUUID()` - results now save to DB
- **Map→Record conversion**: `Object.fromEntries()` fixes JSON serialization
- **Azure Mistral null filtering**: Sanitize options to remove null values
- **Provider abstraction**: Interface + Factory pattern working, 593 tests pass

### Failed/Abandoned
- None explicitly failed, but tool execution verification incomplete

### In Progress
- **Tool execution verification**: Need to confirm tools actually execute during research
- **E2E browser testing**: Playwright MCP tests not yet run
- **Source validation**: Verify `sourcesCount > 0` and citations present

## User Requirements

> "I see that the last 2 tests you made had 0 tool calls and 0 stages, that does not look like you succeeded"

> Tests should use queries requiring 2025 web search (not LLM knowledge)

> Verify the pipeline is actually using tools (Tavily search)

## Blockers & Open Questions

- [ ] **0 tool calls observed**: Are tools being called? Check session log entries for tool execution events
- [ ] **0 sources**: Why is `sourcesCount: 0`? Verify Tavily API is being invoked
- [ ] **LLM hallucination risk**: Is the "answer" from web search or model training data?
- [ ] **E2E test not run**: Playwright MCP browser flow not validated

## Next Steps

1. **Check session logs for tool execution**:
   ```bash
   curl -s "http://localhost:3000/api/logs/sessions/{logId}" | jq '{
     toolCalls: [.entries[] | select(.eventType | contains("tool"))],
     stages: [.entries[] | select(.eventType | contains("stage"))]
   }'
   ```

2. **Verify Tavily API invocation** in `logs/research-combined.log`:
   ```bash
   grep -i "tavily\|tool" logs/research-combined.log | tail -50
   ```

3. **Run E2E test with 2025 query** requiring web search:
   - Query: "What were the major announcements at Google I/O 2025?"
   - Verify sources populated and citations present

4. **Add debug logging** to `src/orchestration/planner.service.ts` tool call section if tools not executing

5. **Complete Phase 6-7** of implementation plan: unit tests + E2E browser tests

## Session Notes

### Environment
- Branch: `feat/sprint3-4-core-agentic`
- LLM: Azure Mistral (`LLM_PROVIDER=azure-mistral`)
- Backend: localhost:3000, Frontend: localhost:4200
- Database: PostgreSQL on port 5433

### Recent Commits
- `a6611d6` docs: add Sprint 5-6 implementation plan
- `6e7f970` docs: add implementation summaries and coverage reports
- `6db4914` fix: resolve race condition and state management bugs

### Test Results
- 593 unit tests passing
- Build compiles successfully
- Server runs without startup errors

### Files Modified (from git status)
Key changes in progress:
- `src/llm/providers/*` - New provider implementations
- `src/llm/llm-provider.factory.ts` - Provider selection
- `src/orchestration/orchestrator.service.ts` - UUID fix, pipelineType
- `src/orchestration/planner.service.ts` - tool_call_id support

---
*Resume command*: `Continue debugging tool execution in research pipeline. Read docs/context/CONTEXT-llm-provider-tool-execution.md first. Focus on verifying Tavily search calls are executing and sources are being collected.`
