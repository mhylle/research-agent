# LLM Provider Switching - Implementation Findings

**Date:** 2025-12-17
**Status:** Rolled back - approach needs revision

## Goal

Add UI dropdown in research component to switch between "local" and "azure" LLM providers at runtime.

- **Local provider URL:** `http://dc2-nvgp011.systematicgroup.local:8087/v1/chat/completions`
- **Local model:** `llama3.3`
- **API format:** OpenAI-compatible

## What Was Attempted

### 1. Created LocalLLMProvider (`src/llm/providers/local.provider.ts`)

- Implemented `ILLMProvider` interface
- Used native `fetch` API for OpenAI-compatible endpoint
- Set `supportsToolCalling = false` (simple implementation)

### 2. Created LLMContextService (`src/llm/llm-context.service.ts`)

- Used `AsyncLocalStorage` from Node.js for request-scoped context
- Allowed wrapping operations with provider context without passing provider through every method

```typescript
@Injectable()
export class LLMContextService {
  private storage = new AsyncLocalStorage<LLMContext>();

  run<T>(context: LLMContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  getProvider(): string | undefined {
    return this.storage.getStore()?.provider;
  }
}
```

### 3. Updated LLMProviderFactory

- Added `local` provider type
- Added `getProviderByName()` method for runtime selection
- Added `getAvailableProviders()` returning `['azure', 'local']`

### 4. Updated LLMService

- Added `getEffectiveProvider()` method with priority:
  1. Explicit parameter
  2. Context from AsyncLocalStorage
  3. Default provider

### 5. Updated Research Layer

- Added `provider?: 'azure' | 'local'` to `ResearchQueryDto`
- Controller passes provider to service
- Service wraps orchestrator call in LLM context

## Issues Encountered

### TypeScript Errors in LocalLLMProvider

1. **`ChatResponse.usage` is required**, not optional
   - Fix: Always provide TokenUsage with default zeros

2. **`ChatStreamChunk` uses `content`, not `message`**
   - The streaming interface differs from non-streaming response

### Architecture Concern

The approach was getting complex:
- Many files modified (6 files)
- New abstraction layer (LLMContextService)
- AsyncLocalStorage adds implicit state

## Key Codebase Insights

### Existing Provider Structure

```
src/llm/
├── providers/
│   ├── ollama.provider.ts      # Local Ollama
│   └── azure-mistral.provider.ts  # Azure Mistral
├── llm-provider.factory.ts     # Provider selection
├── llm.service.ts              # Facade with concurrency control
└── llm.module.ts               # DI registration
```

### Interface Contracts

**ChatResponse** (`src/llm/interfaces/chat-response.interface.ts`):
- `usage: TokenUsage` - REQUIRED, not optional

**ChatStreamChunk** (`src/llm/interfaces/chat-stream-chunk.interface.ts`):
- `content?: string` - NOT `message`
- `done: boolean`
- `usage?: TokenUsage` - optional in streaming

### LLM Call Sites

The `LLMService.chat()` is called from ~15 files throughout the codebase via the orchestration layer.

## Files Reference

| File | Purpose |
|------|---------|
| `src/llm/interfaces/llm-provider.interface.ts` | ILLMProvider contract |
| `src/llm/interfaces/chat-response.interface.ts` | ChatResponse, TokenUsage |
| `src/llm/interfaces/chat-stream-chunk.interface.ts` | Streaming chunk format |
| `src/llm/llm-provider.factory.ts` | Provider instantiation |
| `src/llm/llm.service.ts` | Main facade with concurrency |
| `src/research/dto/research-query.dto.ts` | Request validation |

## Key Insight: Over-Engineering

**The fundamental mistake:** Changes were made in too many unrelated places (research controller, research service, DTOs, context service, etc.)

**The correct approach:**

1. **LLM Layer Only** - Provider selection logic belongs ONLY in `src/llm/`
   - Add LocalLLMProvider
   - Update factory to select provider based on input
   - That's it for backend provider logic

2. **UI Layer** - Simple dropdown that sends provider choice
   - Frontend adds dropdown
   - Sends provider with request
   - LLM layer handles it

**Two touch points, not six:**
- `src/llm/` - technical provider selection
- `client/` - UI for user selection

The orchestration layer, research service, and other layers should NOT know about provider switching. They just call `llmService.chat()` and the LLM layer handles which provider to use.

## Recommendations for Next Attempt

1. **Contain changes to LLM module** - Don't leak provider selection into research/orchestration layers

2. **Simple parameter passing** - The provider name flows: UI → API → LLM layer. No AsyncLocalStorage needed.

3. **Test with curl first** - Verify the local endpoint works before building the full integration

## Environment Variables (for reference)

```bash
# Existing Azure config
AZURE_OPENAI_ENDPOINT=https://your-resource.services.ai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=your_key
AZURE_MISTRAL_MODEL=Mistral-Large-3

# New Local config (proposed)
LOCAL_LLM_URL=http://dc2-nvgp011.systematicgroup.local:8087/v1/chat/completions
LOCAL_LLM_MODEL=llama3.3
```
