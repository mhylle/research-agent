# Brainstorm: LLM Provider Switching v2

**Date:** 2025-12-17
**Status:** Ready for Planning

## Executive Summary

Add runtime LLM provider switching with minimal code changes. The factory already supports `getProviderByName()` - we just need to expose it through LLMService and add a UI dropdown.

## Idea Evolution

### Original Concept
Switch between "local" and "azure" providers via UI dropdown.

### Refined Understanding
The LLM layer already has the infrastructure for runtime provider selection (`LLMProviderFactory.getProviderByName()`). The previous attempt over-engineered by adding AsyncLocalStorage context. The simpler path: add optional `provider` parameter to LLMService methods.

### Key Clarifications Made
- Local URL: `http://dc2-nvgp011.systematicgroup.local:8087/v1/chat/completions`
- Model: `llama3.3` (OpenAI-compatible API)
- Provider selection logic stays in `src/llm/` only
- Intermediate layers just pass the provider string through (no logic)

## Analysis Results

### Strengths (Yellow Hat)
- Factory pattern already supports runtime provider selection
- OpenAI-compatible API means simple implementation
- Minimal changes to existing code

### Risks & Concerns (Black Hat + Premortem)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Local endpoint unreachable | Medium | High | Graceful error handling, fallback messaging |
| TypeScript interface mismatches | Medium | Low | Follow existing provider patterns exactly |
| Breaking existing azure flow | Low | High | Test azure after changes |

### Gaps Identified
- [ ] **Token usage format** - Local LLM may not return usage stats → default to zeros
- [ ] **Tool calling** - Local LLM likely doesn't support → set `supportsToolCalling = false`

### Enhancement Opportunities (SCAMPER)
- **Eliminate**: No AsyncLocalStorage, no context service
- **Simplify**: Provider is just a string parameter flowing through

## Structured Concept

### Component 1: LocalLLMProvider
**Purpose**: OpenAI-compatible provider for local LLM
**Scope**: Chat completion only (no tool calling)
**Dependencies**: fetch API, ConfigService
**Key Decisions**:
- Use native fetch (no SDK needed for OpenAI-compatible)
- Default to zeros for token usage if not provided

### Component 2: LLMService Enhancement
**Purpose**: Accept optional provider parameter
**Scope**: chat() and chatStream() methods
**Dependencies**: LLMProviderFactory
**Key Decisions**:
- If provider param given → use factory.getProviderByName()
- If not → use default this.provider (existing behavior)

### Component 3: API Layer Pass-through
**Purpose**: Flow provider choice from request to LLM layer
**Scope**: DTO + controller/service parameter passing
**Key Decisions**:
- Simple string parameter, no logic in intermediate layers
- Optional field - backward compatible

### Component 4: UI Dropdown
**Purpose**: User selects provider
**Scope**: search-input component
**Dependencies**: ResearchQuery model update
**Key Decisions**:
- Dropdown with "Local" and "Azure" options
- Default to "Local" (or last used)

## Codebase Context

### Existing Infrastructure
- `LLMProviderFactory.getProviderByName(name)` - Already exists at `src/llm/llm-provider.factory.ts:38-46`
- `LLMService.chat(messages, tools?, model?)` - Add provider param
- `ResearchQuery` model at `client/src/app/models/research-query.model.ts`

### Request Flow
```
UI (search-input)
  → research.ts.onQuerySubmitted(query)
  → research.service.submitQuery(query, provider)
  → POST /api/research/query { query, provider }
  → ResearchController.query()
  → ResearchService.executeResearch(query, logId, provider)
  → Orchestrator... → LLMService.chat(messages, tools, provider)
  → factory.getProviderByName(provider) OR this.provider
```

### Files to Modify

**LLM Layer (core changes):**
1. `src/llm/providers/local.provider.ts` - NEW
2. `src/llm/llm-provider.factory.ts` - Register local provider
3. `src/llm/llm.module.ts` - Add LocalLLMProvider to providers
4. `src/llm/llm.service.ts` - Add provider param to chat/chatStream

**API Layer (pass-through only):**
5. `src/research/dto/research-query.dto.ts` - Add provider field
6. `src/research/research.controller.ts` - Pass provider to service
7. `src/research/research.service.ts` - Pass provider to orchestrator
8. `src/orchestration/orchestrator.service.ts` - Pass provider to LLMService

**Frontend:**
9. `client/src/app/models/research-query.model.ts` - Add provider field
10. `client/src/app/features/research/components/search-input/search-input.ts` - Dropdown logic
11. `client/src/app/features/research/components/search-input/search-input.html` - Dropdown UI
12. `client/src/app/core/services/research.service.ts` - Send provider in request

## Recommended Next Steps

1. Create LocalLLMProvider
2. Register in factory and module
3. Add provider param to LLMService
4. Update API layer (DTO → controller → service → orchestrator)
5. Add UI dropdown
6. Test both providers

## Ready for Create-Plan
**Yes**

### Suggested Plan Scope
- Primary deliverables: Working provider switching via UI dropdown
- Key phases: Backend LLM layer → API pass-through → Frontend UI
- Critical success factors: Azure still works, local endpoint accessible
