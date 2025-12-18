# Implementation Plan: LLM Provider Switching

## Overview

Add runtime LLM provider switching via UI dropdown, allowing users to select between "Local" (llama3.3) and "Azure" (Mistral) providers. Default to Azure, no persistence across sessions.

## Context

- Local LLM URL: `http://dc2-nvgp011.systematicgroup.local:8087/v1/chat/completions`
- Local model: `llama3.3` (OpenAI-compatible API)
- Existing factory pattern supports runtime selection via `getProviderByName()`
- Previous attempt over-engineered with AsyncLocalStorage - this plan uses simple parameter passing

## Design Decision

**Approach**: Explicit parameter pass-through

- Add `provider?: string` to LLMService methods
- If provided → `factory.getProviderByName(provider)`
- If not → use default `this.provider` (Azure)
- Intermediate layers pass string without logic

## Implementation Phases

### Phase 1: Backend LLM Layer

**Objective**: Create LocalLLMProvider and expose provider selection through LLMService

**Tasks**:

- [x] Create `src/llm/providers/local.provider.ts`
  - Implement ILLMProvider interface
  - Use native fetch for OpenAI-compatible API
  - Set `supportsToolCalling = false`
  - Default token usage to zeros if not returned

- [ ] Update `src/llm/llm-provider.factory.ts`
  - Add `'local'` to LLMProviderType union (line 10)
  - Inject LocalLLMProvider in constructor
  - Add case for 'local' in getProviderByName() switch (lines 38-46)

- [ ] Update `src/llm/llm.module.ts`
  - Import and add LocalLLMProvider to providers array

- [ ] Update `src/llm/llm.service.ts`
  - Add `provider?: string` parameter to `chat()` signature (line 52)
  - Add `provider?: string` parameter to `chatStream()` signature (line 86)
  - Add provider resolution logic:
    ```typescript
    const selectedProvider = provider
      ? this.factory.getProviderByName(provider)
      : this.provider;
    ```
  - Use `selectedProvider` instead of `this.provider` in method bodies

**Success Criteria**:

Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

Manual Verification:
- [ ] LLMService can be called with provider='local' or provider='azure'

---

### Phase 2: Backend API Pass-through

**Objective**: Flow provider selection from API request to LLMService

**Tasks**:

- [ ] Update `src/research/dto/research-query.dto.ts`
  - Add optional `provider` field with validation:
    ```typescript
    @IsOptional()
    @IsIn(['azure', 'local'])
    provider?: 'azure' | 'local';
    ```

- [ ] Update `src/research/research.controller.ts`
  - Extract `provider` from DTO in query() method
  - Pass to researchService.executeResearch()

- [ ] Update `src/research/research.service.ts`
  - Add `provider?: string` parameter to executeResearch()
  - Pass to orchestrator.executeResearch()

- [ ] Update `src/orchestration/orchestrator.service.ts`
  - Add `provider?: string` parameter to executeResearch()
  - Pass to LLMService.chat() calls throughout orchestration

**Success Criteria**:

Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes

Manual Verification:
- [ ] POST /api/research/query with `{"query": "test", "provider": "azure"}` works
- [ ] POST /api/research/query with `{"query": "test", "provider": "local"}` works

---

### Phase 3: Frontend UI

**Objective**: Add provider dropdown to research interface

**Tasks**:

- [ ] Update `client/src/app/models/research-query.model.ts`
  - Add `provider?: 'azure' | 'local'` to ResearchQuery interface

- [ ] Update `client/src/app/features/research/components/search-input/search-input.ts`
  - Add `selectedProvider` signal with default 'azure'
  - Update `querySubmitted` output to emit `{query, provider}` or add separate output

- [ ] Update `client/src/app/features/research/components/search-input/search-input.html`
  - Add dropdown select before footer:
    ```html
    <div class="search-input__provider">
      <label>Provider:</label>
      <select [(ngModel)]="selectedProvider">
        <option value="azure">Azure (Mistral)</option>
        <option value="local">Local (llama3.3)</option>
      </select>
    </div>
    ```

- [ ] Update `client/src/app/features/research/components/search-input/search-input.scss`
  - Style the provider dropdown to match Digital Hygge design

- [ ] Update `client/src/app/features/research/research.ts`
  - Handle provider from search-input component
  - Pass to researchService.submitQuery()

- [ ] Update `client/src/app/core/services/research.service.ts`
  - Add `provider` parameter to submitQuery()
  - Include in request body

**Success Criteria**:

Automated Verification:
- [ ] `npm run build` succeeds (both backend and frontend)
- [ ] `npm run lint` passes

Manual Verification:
- [ ] Dropdown visible in research UI
- [ ] Dropdown defaults to "Azure"
- [ ] Selecting "Local" and submitting query uses local provider
- [ ] Selecting "Azure" and submitting query uses Azure provider

---

### Phase 4: Verification

**Objective**: Ensure both providers work correctly

**Tasks**:

- [ ] Test Azure provider end-to-end
  - Submit research query with Azure selected
  - Verify response received

- [ ] Test Local provider end-to-end
  - Submit research query with Local selected
  - Verify response received (or graceful error if endpoint unreachable)

- [ ] Verify no regressions
  - Existing research functionality works
  - Chat functionality unaffected (uses default provider)

**Success Criteria**:

Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm test` passes

Manual Verification:
- [ ] Research with Azure: full pipeline completes
- [ ] Research with Local: full pipeline completes (or clear error message)
- [ ] UI is intuitive and matches design system

## Dependencies

- Local LLM endpoint must be accessible: `http://dc2-nvgp011.systematicgroup.local:8087`
- Azure credentials configured in `.env`

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Local endpoint unreachable | Graceful error handling with clear message |
| Token usage not returned by local LLM | Default to zeros |
| Tool calling needed | Set supportsToolCalling=false, research pipeline handles this |
