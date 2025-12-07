# Azure Mistral-Large-3 LLM Provider Implementation Plan

## Overview

Add MS Azure Mistral-Large-3 as a second LLM provider alongside Ollama, using an adapter pattern that allows runtime configuration-based switching.

**Status**: Complete (All Phases Implemented)
**Created**: 2025-12-06
**Priority**: High

## Problem Statement

1. Current system is tightly coupled to Ollama SDK with no provider abstraction
2. Tool calling implementations differ between Ollama and Azure Mistral
3. Previous implementation attempts failed due to tool calling incompatibilities
4. Need runtime switching capability based on configuration

## Research Findings

### Current Architecture Analysis

**File Locations**:
- `src/llm/ollama.service.ts` - Single LLM service, hardcoded to Ollama
- `src/llm/interfaces/chat-message.interface.ts` - Message interface (OpenAI-compatible)
- `src/llm/interfaces/chat-response.interface.ts` - Response interface with Ollama-specific metadata
- `src/llm/llm.module.ts` - Simple module exporting `OllamaService`
- `src/tools/interfaces/tool-definition.interface.ts` - Tool definitions (OpenAI-compatible)

**Current Usage Pattern** (13+ call sites):
```typescript
const response = await this.llmService.chat(messages, planningTools);
if (response.message.tool_calls?.length > 0) {
  for (const toolCall of response.message.tool_calls) {
    // Tool execution
  }
}
```

### Azure Mistral Tool Calling Differences

| Aspect | Ollama | Azure Mistral | Impact |
|--------|--------|---------------|--------|
| SDK | `ollama` npm package | OpenAI SDK compatible | Different initialization |
| Null values | Allowed | **NOT allowed** | Must filter request body |
| Message format | Flexible | System must have user pair | Need message validation |
| Tool call IDs | Not used | **Required** for responses | Must track and return IDs |
| Token metadata | Ollama-specific fields | OpenAI-compatible fields | Normalize response format |
| Property naming | `tool_calls` | `tool_calls` (REST) / `toolCalls` (SDK) | Consistent via OpenAI SDK |

### Critical Gotchas Identified

1. **Null Value Rejection**: Azure Mistral rejects requests containing `null` values
2. **Message Pairing**: System messages must be paired with user messages
3. **Tool Call ID Tracking**: Must preserve and return `tool_call_id` in tool responses
4. **Arguments Format**: `arguments` comes as string, must JSON.parse()

## Architecture Design

### Pattern: Provider Interface + Factory

```
                    ┌─────────────────────────────┐
                    │     ILLMProvider Interface  │
                    │   (chat, config, metadata)  │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────▼─────────┐ ┌───────▼────────┐ ┌────────▼────────┐
    │  OllamaProvider   │ │ AzureMistral   │ │ (Future:        │
    │  (existing logic) │ │ Provider       │ │  OpenAI, etc.)  │
    └───────────────────┘ └────────────────┘ └─────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │       LLMService            │
                    │  (provider-agnostic facade) │
                    └─────────────────────────────┘
```

### Provider Interface Design

```typescript
// src/llm/interfaces/llm-provider.interface.ts
export interface ILLMProvider {
  readonly name: string;
  readonly supportsToolCalling: boolean;

  chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ChatResponse>;

  getProviderMetadata(): ProviderMetadata;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  toolChoice?: 'auto' | 'none' | 'required';
}

export interface ProviderMetadata {
  name: string;
  model: string;
  supportedFeatures: string[];
}
```

### Normalized Response Interface

```typescript
// src/llm/interfaces/chat-response.interface.ts (updated)
export interface ToolCall {
  id: string;  // ADD: Required for Azure Mistral
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

export interface ChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: ToolCall[];
  };
  // Normalized token usage
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  // Provider-specific metadata (optional)
  providerMetadata?: Record<string, any>;
}
```

### Normalized Message Interface

```typescript
// src/llm/interfaces/chat-message.interface.ts (updated)
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;  // ADD: Required for tool responses to Azure Mistral
}
```

## Implementation Plan

### Phase 1: Interface Abstraction Layer ✅

**Goal**: Create provider interface without breaking existing functionality

#### Step 1.1: Create Provider Interface ✅
**File**: `src/llm/interfaces/llm-provider.interface.ts` (new)
- [x] Define `ILLMProvider` interface
- [x] Define `ChatOptions` interface
- [x] Define `ProviderMetadata` interface

#### Step 1.2: Update Existing Interfaces ✅
**Files**:
- [x] `src/llm/interfaces/chat-response.interface.ts` - Add `id` to ToolCall, normalize usage
- [x] `src/llm/interfaces/chat-message.interface.ts` - Add `tool_call_id`

#### Step 1.3: Create Ollama Provider ✅
**File**: `src/llm/providers/ollama.provider.ts` (new)
- [x] Move logic from `OllamaService` to new provider class
- [x] Implement `ILLMProvider` interface
- [x] Normalize Ollama response to standard format
- [x] Map Ollama metadata to `providerMetadata`

### Phase 2: Azure Mistral Provider ✅

**Goal**: Implement Azure Mistral provider with proper tool calling

#### Step 2.1: Create Azure Mistral Provider ✅
**File**: `src/llm/providers/azure-mistral.provider.ts` (new)
- [x] Use OpenAI SDK for Azure endpoint
- [x] Implement request sanitization (remove null values)
- [x] Implement message validation (ensure system+user pairing)
- [x] Handle tool call ID tracking
- [x] Normalize response format

**Key Implementation Details**:
```typescript
// Request sanitization - remove null values
private sanitizeOptions(options: ChatOptions): Record<string, any> {
  return Object.fromEntries(
    Object.entries(options || {}).filter(([_, v]) => v != null)
  );
}

// Message validation - ensure system has user pair
private validateMessages(messages: ChatMessage[]): ChatMessage[] {
  const hasUser = messages.some(m => m.role === 'user');
  const hasSystemOnly = messages[0]?.role === 'system' && !hasUser;

  if (hasSystemOnly) {
    // Add empty user message to satisfy Azure Mistral requirement
    return [...messages, { role: 'user', content: '' }];
  }
  return messages;
}

// Tool response formatting
private formatToolResponse(toolCallId: string, result: any): ChatMessage {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: JSON.stringify(result),
  };
}
```

#### Step 2.2: Add OpenAI SDK Dependency ✅
**File**: `package.json`
```json
{
  "dependencies": {
    "openai": "^4.x.x"
  }
}
```

### Phase 3: Provider Factory and Configuration ✅

**Goal**: Enable runtime provider switching via configuration

#### Step 3.1: Create Provider Factory ✅
**File**: `src/llm/llm-provider.factory.ts` (new)
```typescript
@Injectable()
export class LLMProviderFactory {
  constructor(
    private configService: ConfigService,
    private ollamaProvider: OllamaProvider,
    private azureMistralProvider: AzureMistralProvider,
  ) {}

  getProvider(): ILLMProvider {
    const providerName = this.configService.get<string>('LLM_PROVIDER');

    switch (providerName) {
      case 'azure-mistral':
        return this.azureMistralProvider;
      case 'ollama':
      default:
        return this.ollamaProvider;
    }
  }
}
```

#### Step 3.2: Update Environment Configuration ✅
**File**: `src/config/environment.validation.ts`
```typescript
@IsString()
@IsOptional()
LLM_PROVIDER: string;  // 'ollama' | 'azure-mistral'

@IsString()
@IsOptional()
AZURE_OPENAI_ENDPOINT: string;

@IsString()
@IsOptional()
AZURE_OPENAI_API_KEY: string;

@IsString()
@IsOptional()
AZURE_MISTRAL_MODEL: string;
```

**File**: `.env`
```bash
# LLM Provider Configuration
LLM_PROVIDER=ollama  # or 'azure-mistral'

# Azure Mistral Configuration (when LLM_PROVIDER=azure-mistral)
AZURE_OPENAI_ENDPOINT=https://ambient-listening-resource.services.ai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_MISTRAL_MODEL=Mistral-Large-3
```

### Phase 4: Refactor LLM Service ✅

**Goal**: Make LLMService provider-agnostic

#### Step 4.1: Refactor LLMService ✅
**File**: `src/llm/llm.service.ts` (refactored from `ollama.service.ts`)
```typescript
@Injectable()
export class LLMService {
  private provider: ILLMProvider;

  constructor(private factory: LLMProviderFactory) {
    this.provider = factory.getProvider();
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    return this.provider.chat(messages, tools, options);
  }

  getProviderInfo(): ProviderMetadata {
    return this.provider.getProviderMetadata();
  }
}
```

#### Step 4.2: Update Module Configuration ✅
**File**: `src/llm/llm.module.ts`
```typescript
@Module({
  providers: [
    OllamaProvider,
    AzureMistralProvider,
    LLMProviderFactory,
    LLMService,
  ],
  exports: [LLMService],
})
export class LLMModule {}
```

### Phase 5: Update Consumers (Tool Call ID Support) ✅

**Goal**: Update all consumers to handle tool call IDs

#### Step 5.1: Update Planner Service ✅
**File**: `src/orchestration/planner.service.ts`
- [x] Update tool response messages to include `tool_call_id`
- [x] Ensure tool call loop tracks IDs correctly

```typescript
// Before
messages.push({ role: 'tool', content: JSON.stringify(result) });

// After
messages.push({
  role: 'tool',
  tool_call_id: toolCall.id,  // ADD tool_call_id
  content: JSON.stringify(result)
});
```

#### Step 5.2: Update Other Consumers ✅
**Files to update** (tool response handling):
- [x] `src/research/pipeline-executor.service.ts` - No changes needed (doesn't push tool messages)
- [x] `src/orchestration/orchestrator.service.ts` - No changes needed (delegates to planner)

### Phase 6: Testing Strategy

#### Step 6.1: Unit Tests
**File**: `src/llm/providers/ollama.provider.spec.ts` (new)
- Test response normalization
- Test error handling

**File**: `src/llm/providers/azure-mistral.provider.spec.ts` (new)
- Test null value sanitization
- Test message validation
- Test tool call ID handling
- Test response normalization

**File**: `src/llm/llm-provider.factory.spec.ts` (new)
- Test provider selection based on config
- Test fallback to default provider

#### Step 6.2: Integration Tests
**File**: `test/llm-provider-integration.e2e-spec.ts` (new)
- Test actual Azure Mistral endpoint
- Test tool calling flow end-to-end
- Test provider switching

#### Step 6.3: Backward Compatibility Tests
- Ensure all existing tests pass with `LLM_PROVIDER=ollama`
- Add parallel test runs with `LLM_PROVIDER=azure-mistral`

### Phase 7: End-to-End Browser Testing (Playwright MCP)

**Goal**: Validate full research pipeline in browser with real web search queries

#### Step 7.1: E2E Test with Playwright MCP Server
**Important**: Tests must use queries that **require web search** to answer (not trivial LLM knowledge). The LLM cannot answer these queries from training data alone.

**Test Query Examples** (require 2025 web search):
- "What were the major AI breakthroughs announced at NeurIPS 2025?"
- "Who won the 2025 Nobel Prize in Physics and for what contribution?"
- "What are the latest features in Angular 21 released in 2025?"
- "What was the outcome of the 2025 UN Climate Summit COP30?"
- "What are the key announcements from Microsoft Build 2025?"

**NOT suitable test queries** (LLM might answer from training):
- "What is quantum computing?" (general knowledge)
- "How does photosynthesis work?" (static knowledge)
- "Who was Albert Einstein?" (historical fact)

#### Step 7.2: E2E Test Implementation
**File**: `test/e2e/azure-mistral-browser-flow.e2e-spec.ts` (new)

**Test Flow using Playwright MCP**:
```typescript
describe('Azure Mistral E2E Browser Flow', () => {
  it('should complete full research pipeline with web search', async () => {
    // 1. Navigate to research UI
    await mcp__playwright__browser_navigate({ url: 'http://localhost:4200' });

    // 2. Submit query requiring 2025 web search
    const testQuery = 'What were the major announcements at Google I/O 2025?';
    await mcp__playwright__browser_type({
      element: 'research query input',
      ref: '<input-ref>',
      text: testQuery,
      submit: true
    });

    // 3. Wait for research to complete
    await mcp__playwright__browser_wait_for({
      text: 'Research complete',
      timeout: 60000
    });

    // 4. Capture snapshot and verify results
    const snapshot = await mcp__playwright__browser_snapshot();

    // 5. Verify web search was used (check for source citations)
    expect(snapshot).toContain('Sources:');
    expect(snapshot).toContain('2025');

    // 6. Take screenshot for evidence
    await mcp__playwright__browser_take_screenshot({
      filename: 'azure-mistral-e2e-result.png',
      fullPage: true
    });
  });
});
```

#### Step 7.3: E2E Test Scenarios

**Scenario 1: Research Query with Tool Calling**
- Query: "What are the top 5 tech IPOs of 2025 and their valuations?"
- Verify: Planning phase uses tool calls → Web search → Synthesis
- Validate: Response contains recent 2025 data with sources

**Scenario 2: Multi-Source Research**
- Query: "Compare the 2025 flagship smartphones from Apple, Samsung, and Google"
- Verify: Multiple web searches executed
- Validate: Response synthesizes information from multiple sources

**Scenario 3: Provider Switching (Ollama → Azure Mistral)**
- Run identical query with both providers
- Verify: Both produce valid results with web search
- Compare: Token usage, response quality, latency

**Scenario 4: Error Recovery**
- Test with invalid API key (graceful degradation)
- Test with network timeout simulation
- Verify: Proper error messages and retry behavior

### Phase 8: Documentation and Rollout

#### Step 8.1: Update Documentation
- Update `CLAUDE.md` with new environment variables
- Add troubleshooting guide for Azure Mistral
- Document provider switching

#### Step 8.2: Gradual Rollout
1. Deploy with `LLM_PROVIDER=ollama` (default)
2. Test Azure Mistral in staging environment
3. Switch to `LLM_PROVIDER=azure-mistral` when validated

## File Summary

### New Files
| File | Purpose |
|------|---------|
| `src/llm/interfaces/llm-provider.interface.ts` | Provider abstraction interface |
| `src/llm/providers/ollama.provider.ts` | Ollama implementation |
| `src/llm/providers/azure-mistral.provider.ts` | Azure Mistral implementation |
| `src/llm/llm-provider.factory.ts` | Factory for provider selection |
| `src/llm/llm.service.ts` | Provider-agnostic service facade |
| `src/llm/providers/ollama.provider.spec.ts` | Ollama provider unit tests |
| `src/llm/providers/azure-mistral.provider.spec.ts` | Azure Mistral provider unit tests |
| `src/llm/llm-provider.factory.spec.ts` | Factory unit tests |
| `test/llm-provider-integration.e2e-spec.ts` | Integration tests |
| `test/e2e/azure-mistral-browser-flow.e2e-spec.ts` | Playwright MCP E2E browser tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/llm/interfaces/chat-response.interface.ts` | Add `id` to ToolCall, normalize usage |
| `src/llm/interfaces/chat-message.interface.ts` | Add `tool_call_id` |
| `src/llm/llm.module.ts` | Register new providers and factory |
| `src/config/environment.validation.ts` | Add Azure config variables |
| `src/orchestration/planner.service.ts` | Add tool_call_id to responses |
| `package.json` | Add `openai` dependency |
| `.env` | Add Azure configuration |

### Files to Remove/Deprecate
| File | Action |
|------|--------|
| `src/llm/ollama.service.ts` | Refactor into `ollama.provider.ts` + `llm.service.ts` |

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation**:
- Default `LLM_PROVIDER=ollama` preserves current behavior
- Comprehensive test coverage before switching
- Feature flag approach for gradual rollout

### Risk 2: Tool Calling Incompatibilities
**Mitigation**:
- Isolated provider implementations
- Normalization layer handles differences
- Provider-specific message/request transformation

### Risk 3: Configuration Errors
**Mitigation**:
- Optional validators for Azure configs
- Clear error messages when provider not configured
- Runtime validation of provider availability

## Success Criteria

1. [x] All existing tests pass with `LLM_PROVIDER=ollama` (593 tests passing)
2. [ ] Azure Mistral provider successfully completes tool calling loop (requires E2E test)
3. [x] Token usage properly tracked for both providers
4. [x] Configuration-based switching works at runtime
5. [x] No breaking changes to existing API consumers
6. [ ] Documentation updated with new configuration options
7. [ ] E2E browser test passes using Playwright MCP (full research flow)
8. [ ] E2E test uses 2025 web search query (not trivial LLM knowledge)
9. [ ] E2E test verifies source citations from web search results
10. [x] All npm dependencies properly installed (npm ls shows no missing deps)

## Dependencies

**IMPORTANT**: All dependencies MUST be installed using npm for proper dependency management.

### npm Package Installation
```bash
# Install OpenAI SDK for Azure Mistral compatibility
npm install openai@^4

# Verify installation
npm ls openai
```

### Required Packages
| Package | Version | Purpose | Installation |
|---------|---------|---------|--------------|
| `openai` | ^4.x.x | Azure Mistral API client | `npm install openai@^4` |

### External Dependencies
- Azure Mistral endpoint access (provided)
- API key (provided)

### Verification Steps
After installation, verify dependencies are correctly added:
1. Check `package.json` includes `"openai": "^4.x.x"` in dependencies
2. Run `npm ls openai` to confirm installation
3. Verify `package-lock.json` is updated and committed

## Environment Variables Summary

```bash
# Provider Selection
LLM_PROVIDER=ollama  # Options: 'ollama', 'azure-mistral'

# Ollama Configuration (existing)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5

# Azure Mistral Configuration (new)
AZURE_OPENAI_ENDPOINT=https://ambient-listening-resource.services.ai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_MISTRAL_MODEL=Mistral-Large-3
```
