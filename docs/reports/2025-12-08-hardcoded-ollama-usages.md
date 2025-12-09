# Research: Hardcoded Ollama Usages in Codebase

**Date:** 2025-12-08
**Branch:** master
**Commit:** 97c60f9
**Status:** Documented for future remediation

## Research Question

Where is Ollama hardcoded in the codebase instead of using the configurable LLM provider abstraction (that supports Azure Mistral switching)?

## Summary

The codebase has a **well-designed LLM provider abstraction** that 14+ services correctly use for chat completions. However, **two services bypass this abstraction** and directly call Ollama APIs:

1. **EmbeddingService** - Hardcoded to Ollama's `/api/embed` endpoint (embeddings aren't available on Azure)
2. **WebFetchProvider** - Uses Ollama SDK directly for vision model analysis

Additionally, the **HealthController** has a hardcoded "ollama" field name in its response, even when Azure Mistral is active.

## Detailed Findings

### Properly Abstracted (Working Correctly)

All chat/completion services use `LLMService` correctly:
- Orchestrator, Planner, PipelineExecutor
- Claim extraction, entailment checking, panel evaluation
- Gap detection, refinement, self-critique
- Query decomposition, coverage analysis

### Hardcoded Ollama Usages

#### 1. EmbeddingService (Critical)

| Location | Issue |
|----------|-------|
| `src/knowledge/embedding.service.ts:17-19` | Hardcoded `OLLAMA_BASE_URL` with `localhost:11434` fallback |
| `src/knowledge/embedding.service.ts:35-44` | Direct HTTP POST to `{ollamaBaseUrl}/api/embed` |
| `src/knowledge/embedding.service.ts:113-137` | Direct HTTP POST to `{ollamaBaseUrl}/api/chat` for summarization |

```typescript
// Line 35-44: Direct axios call bypassing provider abstraction
const response = await axios.post(
  `${this.ollamaBaseUrl}/api/embed`,
  { model: this.embeddingModel, input: text },
  { timeout: 30000 },
);
```

**Used by:**
- `KnowledgeSearchService:203` - Hybrid search
- `ResearchResultService:40` - Saving results with embeddings
- `EntailmentCheckerService:68` - Semantic similarity checks

#### 2. WebFetchProvider (Vision Models)

| Location | Issue |
|----------|-------|
| `src/tools/providers/web-fetch.provider.ts:11` | Imports `Ollama` SDK directly |
| `src/tools/providers/web-fetch.provider.ts:123-127` | Creates `new Ollama()` instance |
| `src/tools/providers/web-fetch.provider.ts:373-387` | Calls `this.ollama.generate()` for vision |

```typescript
// Line 123-127: Direct SDK instantiation
const ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';
this.ollama = new Ollama({ host: ollamaBaseUrl });
```

**Purpose:** Analyzes images from web pages using vision models like `llava`

#### 3. HealthController (Minor)

| Location | Issue |
|----------|-------|
| `src/health/health.controller.ts:8` | Response interface has `ollama: boolean` |
| `src/health/health.controller.ts:23` | Returns `{ ollama: true/false }` |

The field name is "ollama" even when Azure Mistral is the active provider.

### Hardcoded Model Names

| File | Line | Model | Purpose |
|------|------|-------|---------|
| `embedding.service.ts` | 21 | `nomic-embed-text` | Embedding model default |
| `embedding.service.ts` | 114 | `qwen3:14b` | Chat model for summarization |
| `web-fetch.provider.ts` | 118 | `llava` | Vision model default |
| `ollama.provider.ts` | 30 | `qwen2.5` | Chat model default |
| `pipeline-executor.service.ts` | 68 | `qwen2.5` | Hardcoded in logging |

### Hardcoded localhost:11434

Found in 3 files as fallback default:
- `src/llm/providers/ollama.provider.ts:27-29`
- `src/knowledge/embedding.service.ts:17-19`
- `src/tools/providers/web-fetch.provider.ts:124-126`

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Services Using LLM                          │
│  (Orchestrator, Planner, Evaluators, Reflection, etc.)          │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Properly abstracted
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        LLMService                               │
│                  (Provider-agnostic facade)                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLMProviderFactory                           │
│           LLM_PROVIDER='ollama' | 'azure-mistral'               │
└──────────────┬─────────────────────────────────────┬────────────┘
               │                                     │
               ▼                                     ▼
┌──────────────────────────┐   ┌──────────────────────────────────┐
│     OllamaProvider       │   │     AzureMistralProvider         │
│   localhost:11434        │   │   Azure OpenAI Endpoint          │
└──────────────────────────┘   └──────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│              BYPASSING ABSTRACTION                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EmbeddingService ──────► Ollama /api/embed (hardcoded)         │
│                                                                 │
│  WebFetchProvider ──────► Ollama SDK (hardcoded)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Code References

| Component | File | Line(s) | Issue |
|-----------|------|---------|-------|
| EmbeddingService | `src/knowledge/embedding.service.ts` | 17-19, 35-44, 113-137 | Direct Ollama HTTP calls |
| WebFetchProvider | `src/tools/providers/web-fetch.provider.ts` | 11, 123-127, 373-387 | Direct Ollama SDK |
| HealthController | `src/health/health.controller.ts` | 8, 23 | Hardcoded "ollama" field name |

## Constraints

- **Embeddings** are Ollama-only because Azure doesn't provide an equivalent embedding model in the current setup
- **Vision models** (llava) are also Ollama-specific capabilities

## Future Remediation

When addressing these issues, consider:

1. **EmbeddingService**: Create an `IEmbeddingProvider` interface with Ollama implementation (and potentially Azure OpenAI embeddings if available)
2. **WebFetchProvider**: Create an `IVisionProvider` interface or make vision optional/configurable
3. **HealthController**: Rename field to generic `llm: boolean` or dynamically use provider name

## Related Files

- `src/llm/llm.service.ts` - Provider-agnostic facade (correct pattern to follow)
- `src/llm/llm-provider.factory.ts` - Provider selection logic
- `src/llm/providers/ollama.provider.ts` - Ollama implementation
- `src/llm/providers/azure-mistral.provider.ts` - Azure Mistral implementation
- `src/config/environment.validation.ts` - Env var validation
