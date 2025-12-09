# LLM Concurrency Control Design

**Date:** 2025-12-08
**Branch:** master
**Commit:** 97c60f9

## Problem Statement

The research agent system hangs when using Azure Mistral due to unbounded concurrent LLM API calls. The codebase uses `Promise.all()` in multiple locations without concurrency limits, causing 10-30+ simultaneous Azure requests that exceed rate limits.

### Concurrent Call Sources

| Location | Pattern | Peak Concurrency |
|----------|---------|------------------|
| `orchestrator.service.ts:345` | Sub-query parallel execution | 5+ concurrent |
| `orchestrator.service.ts:1628` | Agentic sub-query execution | 5+ concurrent |
| `base-phase-executor.ts:97` | Parallel step execution | 2-4 concurrent |
| `panel-evaluator.service.ts:127` | Parallel evaluator panel | 2 concurrent |

## Solution

Implement a concurrency limiter in `LLMService.chat()` using `p-limit` library with a configurable limit (default: 2 concurrent calls).

### Design Decisions

1. **Location:** `LLMService.chat()` - central chokepoint for all LLM calls
2. **Mechanism:** Simple concurrency limiter (not rate limiter)
3. **Library:** `p-limit` - well-tested, lightweight
4. **Default limit:** 2 concurrent calls (conservative)
5. **Configurable:** Via `LLM_MAX_CONCURRENT_CALLS` environment variable

### Why These Choices

- **Central location:** All LLM calls flow through `LLMService.chat()`, so one change fixes all concurrent call sources
- **Concurrency limiter vs rate limiter:** Symptoms indicate concurrent request overload, not per-minute quota exhaustion
- **Default of 2:** Conservative to prevent hangs; can be increased if Azure tier allows
- **Configurable:** Different Azure tiers have different limits; allows tuning without code changes

## Implementation

### Core Change: `src/llm/llm.service.ts`

```typescript
import pLimit, { LimitFunction } from 'p-limit';

@Injectable()
export class LLMService {
  private provider: ILLMProvider;
  private concurrencyLimit: LimitFunction;

  constructor(
    private factory: LLMProviderFactory,
    private configService: ConfigService,
  ) {
    this.provider = factory.getProvider();

    const maxConcurrent = this.configService.get<number>('LLM_MAX_CONCURRENT_CALLS') || 2;
    this.concurrencyLimit = pLimit(maxConcurrent);

    console.log(`[LLMService] Initialized with provider: ${this.provider.name}, max concurrent: ${maxConcurrent}`);
  }

  async chat(messages, tools?, model?): Promise<ChatResponse> {
    const options = model ? { model } : undefined;

    const pending = this.concurrencyLimit.pendingCount;
    const active = this.concurrencyLimit.activeCount;

    if (pending > 0) {
      console.log(`[LLMService] Queued call (active: ${active}, pending: ${pending})`);
    }

    return this.concurrencyLimit(() =>
      this.provider.chat(messages, tools, options)
    );
  }
}
```

### Configuration: `src/config/environment.validation.ts`

```typescript
@IsOptional()
@IsNumber()
@Min(1)
@Max(10)
LLM_MAX_CONCURRENT_CALLS?: number;
```

### Environment Variable

```bash
LLM_MAX_CONCURRENT_CALLS=2
```

## Files to Modify

1. `src/llm/llm.service.ts` - Add concurrency limiter
2. `src/config/environment.validation.ts` - Add validation
3. `.env.example` - Document new variable
4. `src/llm/llm.service.spec.ts` - Update tests

## Error Handling

- Existing retry logic in `pipeline-executor.service.ts` handles transient failures
- Queue continues processing on individual call failures
- No additional error handling required

## Verification

1. Run complex query that previously caused hangs
2. Observe logs: `Queued call (active: 2, pending: X)`
3. Verify system completes without hanging
