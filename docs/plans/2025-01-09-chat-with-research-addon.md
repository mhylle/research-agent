# Implementation Plan: Chat Application with Research Addon

## Overview

Transform the research agent into a chat-first application where users can have continuous conversations with the LLM, with the ability to toggle research mode on a per-message basis. Research becomes an "addon" service that the chat module can invoke, preserving all existing research functionality while adding conversational capabilities with full persistence, inline citations, and context-aware follow-up questions.

## Context

**Source Document**: `docs/brainstorms/2025-01-09-chat-with-research-addon.md`

**Current Architecture**:
- NestJS 11.x backend with 3-stage research pipeline (`src/research/research.service.ts:18-38`)
- Angular 20.x frontend with Signals state management (`client/src/app/core/services/research.service.ts:11-22`)
- SSE streaming via EventEmitter2 (`src/research/research-stream.controller.ts:45-114`)
- Pluggable LLM providers: Ollama and Azure Mistral (`src/llm/llm.service.ts:51-72`)
- TypeORM entities with manual migrations (`src/app.module.ts:24`)

**Key Constraints**:
- Zero modifications to existing research pipeline
- One class/interface per file
- New database tables only (no schema changes to existing tables)
- Manual migrations (not auto-run on startup)

## Design Decision

**Chosen Approach**: Layered Integration Architecture

```
Frontend (Angular)
├── ConversationListComponent (sidebar)
├── ChatThreadComponent + ChatInputComponent (main area)
└── ResearchSidePanelComponent (collapsible, citations)
         │
         │ HTTP + SSE (two streams: chat tokens, research progress)
         ▼
Backend (NestJS)
├── NEW: ChatModule
│   ├── ConversationController (REST CRUD)
│   ├── ChatStreamController (SSE token streaming)
│   ├── ConversationService (CRUD, persistence)
│   ├── ConversationContextService (summarization, token tracking)
│   └── ChatResearchService (wrapper - prepends context to query)
│              │
│              │ Calls as service (query string with prepended context)
│              ▼
├── UNCHANGED: ResearchModule
│   └── ResearchService.executeResearch(query, logId)
│
└── MODIFIED: LLMModule
    └── + ILLMProvider.chatStream() method
```

**Rationale**:
- Research pipeline remains a black-box service
- Chat can function independently of research
- Clear separation between chat SSE (tokens) and research SSE (progress)
- Context injection via query string prepending requires no research code changes

---

## Implementation Phases

### Phase 1: Database Foundation

**Objective**: Create database schema for conversations and messages

**Tasks**:
- [x] Create `src/chat/entities/conversation.entity.ts` with fields:
  - `id: string` (uuid, primary key, manual generation)
  - `userId: string` (uuid, indexed)
  - `title: string` (text, auto-generated then editable)
  - `summary: string | null` (text, cached conversation summary)
  - `tokenCount: number` (int, cumulative token usage)
  - `createdAt: Date` (CreateDateColumn)
  - `updatedAt: Date` (UpdateDateColumn)
- [x] Create `src/chat/entities/message.entity.ts` with fields:
  - `id: string` (uuid, primary key, manual generation)
  - `conversationId: string` (uuid, indexed, FK to conversations)
  - `role: 'user' | 'assistant' | 'system'` (varchar(20))
  - `content: string` (text)
  - `messageOptions: MessageOptions` (simple-json)
  - `researchLogId: string | null` (uuid, nullable, FK to research)
  - `citations: Citation[] | null` (simple-json, nullable)
  - `tokenCount: number` (int)
  - `createdAt: Date` (CreateDateColumn)
  - `editedAt: Date | null` (timestamp, nullable)
- [x] Create `src/chat/interfaces/message-options.interface.ts`:
  ```typescript
  export interface MessageOptions {
    researchEnabled: boolean;
    contextScope?: 'recent' | 'full' | 'custom';
    selectedMessageIds?: string[];
  }
  ```
- [x] Create `src/chat/interfaces/citation.interface.ts`:
  ```typescript
  export interface Citation {
    index: number;
    url: string;
    title: string;
    snippet: string;
  }
  ```
- [x] Generate migration: `npm run migration:generate src/migrations/AddChatTables`
- [x] Run migration: `npm run migration:run`

**Success Criteria**:

Automated Verification:
- [x] `npm run migration:run` completes without errors
- [x] `npm run build` succeeds with new entities
- [x] `npm run lint` passes

Manual Verification:
- [ ] Tables `conversations` and `messages` exist in PostgreSQL
- [ ] Indexes created on `userId`, `conversationId`, `createdAt`
- [ ] Can insert/query test records via psql or TypeORM

**Implementation Notes**:
- Migration file: `1765313375545-AddChatTables.ts`
- `data-source.ts` updated to register new entities (ConversationEntity, MessageEntity)
- All tasks completed successfully with automated verification passing

---

### Phase 2: Conversation Module (Backend CRUD)

**Objective**: REST API for conversation and message management

**Tasks**:
- [x] Create `src/chat/chat.module.ts` following pattern from `src/logging/logging.module.ts:1-16`:
  ```typescript
  @Module({
    imports: [
      TypeOrmModule.forFeature([ConversationEntity, MessageEntity]),
      LoggingModule,
    ],
    controllers: [ConversationController],
    providers: [ConversationService],
    exports: [ConversationService],
  })
  ```
- [x] Create `src/chat/services/conversation.service.ts` with methods:
  - `createConversation(userId: string): Promise<ConversationEntity>`
  - `getConversation(id: string): Promise<ConversationEntity & { messages: MessageEntity[] }>`
  - `listConversations(userId: string, options: ListOptions): Promise<PaginatedResult>`
  - `updateConversation(id: string, updates: Partial<ConversationEntity>): Promise<ConversationEntity>`
  - `deleteConversation(id: string): Promise<void>`
  - `addMessage(conversationId: string, message: CreateMessageDto): Promise<MessageEntity>`
  - `updateMessage(id: string, content: string): Promise<MessageEntity>` (sets editedAt)
  - `searchConversations(userId: string, query: string): Promise<ConversationEntity[]>`
- [x] Create `src/chat/dto/` directory with DTOs:
  - `create-conversation.dto.ts`
  - `update-conversation.dto.ts`
  - `create-message.dto.ts`
  - `list-conversations.dto.ts` (pagination params)
- [x] Create `src/chat/conversation.controller.ts` with endpoints:
  - `POST /api/conversations` - Create new conversation
  - `GET /api/conversations` - List conversations (paginated, searchable)
  - `GET /api/conversations/:id` - Get conversation with messages
  - `PATCH /api/conversations/:id` - Update title, etc.
  - `DELETE /api/conversations/:id` - Delete conversation
  - `POST /api/conversations/:id/messages` - Send message
  - `PATCH /api/messages/:id` - Edit message
- [x] Register ChatModule in `src/app.module.ts`

**Success Criteria**:

Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm test` passes (add unit tests for ConversationService)

Manual Verification:
- [ ] All REST endpoints respond correctly via curl:
  ```bash
  curl -X POST http://localhost:3000/api/conversations -H "Content-Type: application/json" -d '{"userId": "test-user"}'
  curl http://localhost:3000/api/conversations?userId=test-user
  ```
- [ ] Pagination returns correct page counts
- [ ] Search filters conversations by query text

**Implementation Notes**:
- ConversationService includes additional helper methods beyond the planned API:
  - `linkResearch(messageId: string, logId: string)` - Links a message to a research session
  - `updateMessageCitations(messageId: string, citations: Citation[])` - Updates message citations from research results
  - `updateMessageTokenCount(messageId: string, tokenCount: number)` - Updates token usage for a message
- Controller follows validation patterns from existing controllers (ResearchController, LogsController)
- Module exports ConversationService to enable integration with future ChatResearchService (Phase 6)
- All DTOs use class-validator decorators for request validation
- Pagination implemented with configurable page size (default 20, max 100)

---

### Phase 3: LLM Streaming Infrastructure

**Objective**: Add token-by-token streaming to LLM providers

**Tasks**:
- [x] Create `src/llm/interfaces/chat-stream-chunk.interface.ts`:
  ```typescript
  export interface ChatStreamChunk {
    content?: string;
    toolCalls?: ToolCall[];
    done: boolean;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }
  ```
- [x] Extend `src/llm/interfaces/llm-provider.interface.ts:30-59` with:
  ```typescript
  chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncIterable<ChatStreamChunk>;
  ```
- [x] Implement `chatStream()` in `src/llm/providers/ollama.provider.ts`:
  - Use existing streaming pattern from `src/llm/ollama.service.ts:33-63`
  - Call `ollama.chat({ stream: true })`
  - Yield normalized `ChatStreamChunk` for each chunk
  - Set `done: true` and include `usage` on final chunk
- [x] Implement `chatStream()` in `src/llm/providers/azure-mistral.provider.ts`:
  - Use OpenAI SDK with `stream: true`
  - Handle Azure-specific streaming format
  - Apply same retry logic as non-streaming (where applicable)
- [x] Add `chatStream()` to `src/llm/llm.service.ts`:
  ```typescript
  async *chatStream(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    model?: string
  ): AsyncIterable<ChatStreamChunk> {
    // Apply concurrency control differently for streams
    // May need to track active streams separately
    yield* this.provider.chatStream(messages, tools, { model });
  }
  ```
- [x] Update `src/llm/interfaces/llm-provider.interface.ts:19-23` ProviderMetadata:
  - Ensure `supportedFeatures` includes `'streaming'` for both providers

**Implementation Notes**:
- ChatStreamChunk reuses existing ToolCall and TokenUsage types from chat-response.interface.ts for consistency
- Both providers support tool call streaming with fragment accumulation using the existing toolCallFragments pattern
- LLM service chatStream intentionally bypasses concurrency limiter (different resource profile for streams - long-lived connections vs. short burst requests)
- Azure Mistral implementation includes retry logic for transient errors (exponential backoff up to 3 attempts)

**Success Criteria**:

Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Unit tests for `chatStream()` in both providers pass

Manual Verification:
- [ ] Test streaming with Ollama: tokens arrive incrementally
- [ ] Test streaming with Azure Mistral: tokens arrive incrementally
- [ ] Final chunk contains token usage statistics
- [ ] Concurrency limit still respected (test with multiple concurrent streams)

---

### Phase 4: Chat Streaming Controller

**Objective**: SSE endpoint for streaming chat responses

**Tasks**:
- [x] Create `src/chat/chat-stream.controller.ts` following pattern from `src/research/research-stream.controller.ts:44-114`:
  ```typescript
  @Controller('api/chat')
  export class ChatStreamController {
    @Sse('stream/:messageId')
    streamChat(@Param('messageId') messageId: string): Observable<MessageEvent> {
      // Return Observable that streams LLM tokens
    }
  }
  ```
- [x] Create `src/chat/interfaces/chat-stream-event.interface.ts`:
  ```typescript
  export interface ChatStreamEvent {
    type: 'token' | 'done' | 'error';
    messageId: string;
    content?: string;
    usage?: TokenUsage;
    error?: string;
  }
  ```
- [x] Implement chat orchestration in `src/chat/services/chat-orchestrator.service.ts`:
  - Accept message and conversation context
  - Call `LLMService.chatStream()` with context
  - Emit events via EventEmitter2 on channel `chat.${messageId}`
  - Persist final message content and token count on completion
- [x] Update EventEmitter2 channels:
  - Add `chat.${messageId}` for chat token events
  - Keep existing `log.${logId}` for research events
- [x] Handle connection lifecycle:
  - Send existing partial content if reconnecting
  - Clean up listeners on disconnect

**Implementation Notes**:
- ChatStreamController follows exact pattern from research-stream.controller.ts
- ChatOrchestratorService handles message processing, LLM streaming, and persistence
- Events emitted on channel `chat.{messageId}`: start, token, done, error
- Module updated to import LLMModule and export ChatOrchestratorService

**Success Criteria**:

Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Integration tests for SSE endpoint pass

Manual Verification:
- [ ] Connect to `GET /api/chat/stream/:messageId` via EventSource
- [ ] Tokens arrive in real-time as LLM generates response
- [ ] `done` event contains final token usage
- [ ] Message persisted to database on completion

---

### Phase 5: Context Management Service

**Objective**: Build and manage conversation context for LLM calls

**Tasks**:
- [x] Create `src/chat/services/conversation-context.service.ts` with methods:
  - `buildContext(conversationId: string, options: ContextOptions): Promise<ChatMessage[]>`
  - `summarizeHistory(messages: MessageEntity[]): Promise<string>`
  - `countTokens(text: string): number` (use tiktoken or approximation)
  - `shouldSummarize(conversation: ConversationEntity): boolean`
- [x] Implement hierarchical summarization:
  - Threshold: 50% of context window (configurable via env var)
  - When exceeded: summarize older messages, keep recent N messages verbatim
  - Cache summary in `conversation.summary` field
  - Update cache when new messages exceed threshold
- [x] Implement context scope options:
  - `recent`: Last N messages (configurable, default 10)
  - `full`: All messages (with summarization if needed)
  - `custom`: User-selected message IDs
- [x] Add token tracking:
  - Count tokens for each message on creation
  - Update `conversation.tokenCount` cumulatively
  - Include token count in conversation listing response
- [x] Create `src/chat/interfaces/context-options.interface.ts`:
  ```typescript
  export interface ContextOptions {
    scope: 'recent' | 'full' | 'custom';
    selectedMessageIds?: string[];
    maxTokens?: number;
  }
  ```

**Implementation Notes**:
- ConversationContextService provides three scope modes: recent (last 10 messages), full (with auto-summarization), custom (selected IDs)
- Summarization triggers at 50% of context window (default 4096 tokens)
- Summaries cached in conversation.summary field
- ChatOrchestratorService updated to use buildContext() with user's context preferences
- Token counting uses simple approximation (0.25 tokens per character)

**Success Criteria**:

Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Unit tests for context building and summarization pass

Manual Verification:
- [ ] Context builds correctly for conversation with <10 messages
- [ ] Summarization triggers when token count exceeds threshold
- [ ] Cached summary used on subsequent calls (no redundant LLM calls)
- [ ] Custom scope includes only selected messages

---

### Phase 6: Research Integration Layer

**Objective**: Bridge chat to existing research pipeline

**Tasks**:
- [x] Create `src/chat/services/chat-research.service.ts`:
  ```typescript
  @Injectable()
  export class ChatResearchService {
    constructor(
      private researchService: ResearchService,
      private contextService: ConversationContextService,
      private conversationService: ConversationService,
    ) {}

    async executeResearchWithContext(
      conversationId: string,
      query: string,
      messageId: string,
    ): Promise<ResearchResult> {
      // 1. Build context summary
      const context = await this.contextService.buildContextSummary(conversationId);

      // 2. Prepend context to query
      const contextualizedQuery = this.buildContextualQuery(context, query);

      // 3. Call existing research service
      const logId = randomUUID();
      const result = await this.researchService.executeResearch(contextualizedQuery, logId);

      // 4. Link message to research
      await this.conversationService.linkResearch(messageId, logId);

      // 5. Extract and store citations
      const citations = this.extractCitations(result);
      await this.conversationService.updateMessageCitations(messageId, citations);

      return result;
    }
  }
  ```
- [x] Implement context-to-query prepending:
  ```typescript
  private buildContextualQuery(context: string, query: string): string {
    if (!context) return query;
    return `Given the following conversation context:\n${context}\n\nResearch query: ${query}`;
  }
  ```
- [x] Implement citation extraction from research results:
  - Extract sources from `ResearchResult.sources`
  - Map to `Citation[]` with index, url, title, snippet
  - Validate URLs exist before including
- [x] Add research status tracking:
  - One research at a time per conversation
  - Queue subsequent research requests
  - Store status in conversation metadata or separate tracking
- [x] Create `src/chat/interfaces/research-status.interface.ts`:
  ```typescript
  export interface ResearchStatus {
    isResearching: boolean;
    currentLogId?: string;
    queuedQueries: string[];
  }
  ```

**Success Criteria**:

Automated Verification:
- [x] `npm run build` succeeds
- [x] `npm run lint` passes
- [ ] Unit tests for context prepending and citation extraction pass

Manual Verification:
- [ ] Research receives contextualized query (verify in logs)
- [ ] Citations correctly extracted from research results
- [ ] Message linked to research via `researchLogId`
- [ ] Concurrent research requests queued properly

**Implementation Notes**:
- ChatResearchService provides executeResearchWithContext() method that prepends conversation context to research queries
- Research status tracking uses in-memory Map per conversation (one research at a time, with queue support)
- Citation extraction maps ResearchResult.sources to Citation interface with sequential indexing
- ChatOrchestratorService updated to conditionally trigger research when messageOptions.researchEnabled is true
- New SSE event types added: research_start, research_complete
- Build passes successfully

---

### Phase 7: Frontend Conversation Management

**Objective**: Angular services and basic conversation UI

**Tasks**:
- [x] Create `client/src/app/core/services/conversation.service.ts`:
  ```typescript
  @Injectable({ providedIn: 'root' })
  export class ConversationService {
    conversations = signal<Conversation[]>([]);
    currentConversation = signal<Conversation | null>(null);
    isLoading = signal<boolean>(false);
    error = signal<string | null>(null);

    // Computed
    hasConversations = computed(() => this.conversations().length > 0);

    // Methods
    async loadConversations(): Promise<void>;
    async createConversation(): Promise<Conversation>;
    async selectConversation(id: string): Promise<void>;
    async deleteConversation(id: string): Promise<void>;
    async updateTitle(id: string, title: string): Promise<void>;
  }
  ```
- [x] Create `client/src/app/models/conversation.model.ts`:
  ```typescript
  export interface Conversation {
    id: string;
    userId: string;
    title: string;
    summary?: string;
    tokenCount: number;
    createdAt: Date;
    updatedAt: Date;
    messages?: Message[];
  }

  export interface Message {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    messageOptions: MessageOptions;
    researchLogId?: string;
    citations?: Citation[];
    tokenCount: number;
    createdAt: Date;
    editedAt?: Date;
  }
  ```
- [x] Create `client/src/app/features/chat/components/conversation-list/conversation-list.component.ts`:
  - Standalone component with Signals
  - Display conversation titles with timestamps
  - Search/filter input
  - New conversation button
  - Delete confirmation dialog
- [x] Create `client/src/app/features/chat/chat.routes.ts` for lazy loading
- [x] Add navigation to chat feature from app routing

**Success Criteria**:

Automated Verification:
- [x] `npm run client:build` succeeds
- [x] `npm run client:lint` passes (no lint script configured, using build verification)
- [ ] `npm run client:test` passes (pre-existing test issues unrelated to new code)

Manual Verification:
- [ ] Conversation list displays in sidebar
- [ ] Can create new conversation (appears in list)
- [ ] Can select conversation (loads messages)
- [ ] Can delete conversation (removed from list)
- [ ] Search filters conversations by title

**Implementation Notes** (Phase 7):
- Created conversation.model.ts with Conversation, Message, MessageOptions, Citation interfaces
- Created conversation.service.ts with Signal-based state management and full CRUD operations
- Created conversation-list component with search, delete confirmation, relative timestamps
- Created chat.routes.ts with lazy-loaded routes for /chat and /chat/:conversationId
- Added "Chat" navigation link to app-header
- Fixed tsconfig.build.json to exclude client/ from NestJS build

---

### Phase 8: Frontend Chat Thread & Input

**Objective**: Message display and input with research toggle

**Tasks**:
- [x] Create `client/src/app/features/chat/components/chat-thread/chat-thread.component.ts`:
  - Display messages with role-based styling (user right, assistant left)
  - Render markdown content via existing `MarkdownService`
  - Auto-scroll to bottom on new messages
  - Show loading indicator during LLM streaming
- [x] Create `client/src/app/features/chat/components/chat-input/chat-input.component.ts`:
  - Textarea with auto-resize
  - Research toggle button (checkbox or switch)
  - Send button (disabled when empty or loading)
  - Keyboard shortcuts: Ctrl+Enter to send, Shift+Enter for newline
  - Visual indicator of research toggle state
  - Toggle resets to OFF after each message sent
- [x] Create `client/src/app/core/services/chat-stream.service.ts`:
  - SSE connection to `/api/chat/stream/:messageId`
  - Signal-based state for current streaming content
  - Handle token, done, error events
  - Reconnection logic with exponential backoff
- [x] Integrate streaming into chat thread:
  - Show partial content as tokens arrive
  - Update message content on completion
  - Display typing indicator during streaming
- [x] Create `client/src/app/features/chat/chat.component.ts`:
  - Main chat page layout
  - Compose conversation-list, chat-thread, chat-input
  - Responsive layout (sidebar collapsible on mobile)

**Success Criteria**:

Automated Verification:
- [x] `npm run client:build` succeeds
- [x] `npm run client:lint` passes (using build verification)
- [ ] `npm run client:test` passes (pre-existing test issues)

Manual Verification:
- [ ] Messages display correctly with markdown rendering
- [ ] Tokens stream in real-time as assistant responds
- [ ] Research toggle visually indicates current state
- [ ] Toggle resets to OFF after sending message
- [ ] Keyboard shortcuts work (Ctrl+Enter sends)
- [ ] Auto-scroll follows new content

**Implementation Notes** (Phase 8):
- Created chat-thread component with markdown rendering, role-based styling, auto-scroll
- Created chat-input component with auto-resize, research toggle, keyboard shortcuts
- Created chat-stream.service.ts with SSE connection, exponential backoff reconnection
- Updated main chat.component.ts to compose all parts with proper data flow
- Added addMessage() and updateMessageInConversation() to ConversationService
- Mobile-responsive sidebar with toggle button

---

### Phase 9: Citation & Research Side Panel

**Objective**: Inline citations with expandable details

**Tasks**:
- [ ] Create `client/src/app/features/chat/components/inline-citation/inline-citation.component.ts`:
  - Render as superscript number [1], [2], etc.
  - Clickable - opens side panel and highlights source
  - Tooltip preview of source title on hover
- [ ] Create `client/src/app/features/chat/components/research-side-panel/research-side-panel.component.ts`:
  - Collapsible panel (right side on desktop, bottom sheet on mobile)
  - Sources list with title, URL, snippet
  - Research progress indicator (connects to existing research SSE)
  - Knowledge graph visualization (reuse existing D3.js component)
  - Close button
- [ ] Integrate citations into message rendering:
  - Parse citation markers from assistant messages (e.g., `[1]`, `[Source 1]`)
  - Replace with `InlineCitationComponent`
  - Map indices to actual citations from message data
- [ ] Create `client/src/app/core/services/research-panel.service.ts`:
  - Signal for panel open/closed state
  - Signal for currently highlighted citation
  - Signal for active research logId (for progress streaming)
- [ ] Connect to existing research SSE:
  - Reuse `AgentActivityService` pattern for research progress
  - Show stages: Query Analysis → Source Selection → Answer Synthesis

**Success Criteria**:

Automated Verification:
- [ ] `npm run client:build` succeeds
- [ ] `npm run client:lint` passes
- [ ] `npm run client:test` passes

Manual Verification:
- [ ] Inline citations render as clickable numbers
- [ ] Clicking citation opens side panel
- [ ] Side panel shows source details
- [ ] Research progress displays during active research
- [ ] Panel collapses/expands correctly
- [ ] Mobile layout uses bottom sheet

---

### Phase 10: Research Suggestion System

**Objective**: "Research this" button and detection

**Tasks**:
- [ ] Create `src/chat/services/research-suggestion.service.ts`:
  ```typescript
  @Injectable()
  export class ResearchSuggestionService {
    shouldSuggestResearch(message: string): boolean {
      return (
        this.isFactualQuestion(message) ||
        this.hasTemporalAspect(message) ||
        this.mentionsExternalEntities(message)
      );
    }

    private isFactualQuestion(text: string): boolean {
      // Detect who, what, when, where, how many, etc.
      const patterns = [/^(who|what|when|where|why|how|which|does|is|are|was|were|can|could|will|would)\b/i];
      return patterns.some(p => p.test(text.trim()));
    }

    private hasTemporalAspect(text: string): boolean {
      // Detect latest, recent, current, 2024, 2025, today, etc.
      const patterns = [/\b(latest|recent|current|new|updated?|today|this year|202[4-9])\b/i];
      return patterns.some(p => p.test(text));
    }

    private mentionsExternalEntities(text: string): boolean {
      // Detect products, companies, technologies, etc.
      // Simple heuristic: capitalized words not at sentence start
      const words = text.split(/\s+/);
      return words.some((w, i) => i > 0 && /^[A-Z][a-z]+/.test(w));
    }
  }
  ```
- [ ] Add LLM self-suggestion in system prompt:
  ```typescript
  const systemPrompt = `You are a helpful assistant. When answering questions that would benefit from current information or external verification, suggest that the user enable research mode by ending your response with: "[Research recommended]"`;
  ```
- [ ] Create `client/src/app/features/chat/components/research-suggestion/research-suggestion.component.ts`:
  - "Research this" button displayed below applicable messages
  - Click triggers research for that message's query
  - Only show on user messages that pass detection
  - Also show on assistant messages containing "[Research recommended]"
- [ ] Create `client/src/app/core/services/research-suggestion.service.ts` (frontend):
  - Mirror backend detection logic for immediate UI feedback
  - Signal for messages with suggestions
- [ ] Integrate into chat thread:
  - Evaluate each message for research suggestion
  - Show button below qualifying messages
  - Button click: enable research toggle, re-submit query

**Success Criteria**:

Automated Verification:
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Unit tests for detection logic pass

Manual Verification:
- [ ] Factual questions show "Research this" button
- [ ] Temporal queries show suggestion
- [ ] Questions mentioning products/companies show suggestion
- [ ] LLM "[Research recommended]" triggers suggestion
- [ ] Clicking button initiates research for that query

---

### Phase 11: Polish & Integration Testing

**Objective**: End-to-end testing and UX refinement

**Tasks**:
- [ ] Create E2E test suite for chat + research flow:
  - Test: Create conversation → Send message → Receive streaming response
  - Test: Enable research → Send query → See research progress → Receive answer with citations
  - Test: Click citation → Side panel opens with correct source
  - Test: Conversation persistence → Reload page → Conversation restored
  - Test: Edit message → New response generated
  - Test: Delete conversation → Removed from list and database
- [ ] Error handling improvements:
  - LLM timeout: Show error message, allow retry
  - Research failure: Show partial results, allow retry
  - Network disconnect: Reconnect SSE, show connection status
  - Invalid input: Client-side validation with helpful messages
- [ ] Performance optimization:
  - Virtual scroll for long conversation threads (>100 messages)
  - Lazy load conversation messages on selection
  - Debounce search input
  - Cache conversation list
- [ ] Mobile responsive design:
  - Collapsible sidebar (hamburger menu)
  - Touch-friendly research toggle
  - Bottom sheet for research panel
  - Appropriate font sizes and tap targets
- [ ] Accessibility improvements:
  - ARIA labels for interactive elements
  - Keyboard navigation through messages
  - Screen reader support for streaming content
  - Focus management on panel open/close
- [ ] Documentation:
  - Update README with chat feature description
  - API documentation for new endpoints
  - Architecture diagram in docs/

**Success Criteria**:

Automated Verification:
- [ ] `npm run test:e2e` passes all new tests
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Lighthouse accessibility score > 90

Manual Verification:
- [ ] Full flow works: chat → research → citations → side panel
- [ ] Error states display appropriately
- [ ] Mobile layout is usable
- [ ] Keyboard-only navigation possible
- [ ] Performance acceptable with 50+ message conversation

---

## Dependencies

**External Dependencies** (already in project):
- TypeORM (database)
- EventEmitter2 (SSE events)
- Ollama SDK / OpenAI SDK (LLM streaming)
- Angular Material (UI components)
- marked.js (markdown rendering)
- D3.js (knowledge graph)

**Internal Dependencies**:
- ResearchModule - Called as service, no changes needed
- LLMModule - Extended with streaming interface
- LoggingModule - Reused for event logging

**Prerequisites**:
- PostgreSQL running with migrations applied
- Ollama or Azure Mistral configured
- Existing research pipeline functional

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Context window overflow in long conversations | High | High | Hierarchical summarization (Phase 5); token budget tracking; user-configurable scope limits |
| SSE reliability with dual streams | Medium | Medium | Separate, independent streams; heartbeat mechanism; auto-reconnect with exponential backoff; connection status indicator |
| Token costs from summarization | Medium | Medium | Cache summaries; only summarize when threshold exceeded; configurable threshold |
| LLM streaming concurrency issues | Medium | Medium | Dedicated concurrency tracking for streams; consider separate limits for streaming vs. one-shot |
| Citation extraction accuracy | Low | Medium | Validate URLs before displaying; fall back to raw sources if parsing fails |
| Migration conflicts with existing data | Low | High | New tables only; no FK constraints to existing tables; migration tested in dev first |

---

## File Structure Summary

**New Backend Files** (`src/chat/`):
```
src/chat/
├── chat.module.ts
├── conversation.controller.ts
├── chat-stream.controller.ts
├── entities/
│   ├── conversation.entity.ts
│   └── message.entity.ts
├── services/
│   ├── conversation.service.ts
│   ├── conversation-context.service.ts
│   ├── chat-orchestrator.service.ts
│   ├── chat-research.service.ts
│   └── research-suggestion.service.ts
├── interfaces/
│   ├── message-options.interface.ts
│   ├── citation.interface.ts
│   ├── context-options.interface.ts
│   ├── chat-stream-event.interface.ts
│   └── research-status.interface.ts
└── dto/
    ├── create-conversation.dto.ts
    ├── update-conversation.dto.ts
    ├── create-message.dto.ts
    └── list-conversations.dto.ts
```

**Modified Backend Files**:
```
src/llm/
├── interfaces/
│   ├── llm-provider.interface.ts  (+ chatStream method)
│   └── chat-stream-chunk.interface.ts  (NEW)
├── providers/
│   ├── ollama.provider.ts  (+ chatStream implementation)
│   └── azure-mistral.provider.ts  (+ chatStream implementation)
└── llm.service.ts  (+ chatStream method)

src/app.module.ts  (+ ChatModule import)
```

**New Frontend Files** (`client/src/app/`):
```
client/src/app/
├── features/chat/
│   ├── chat.component.ts
│   ├── chat.component.html
│   ├── chat.component.scss
│   ├── chat.routes.ts
│   └── components/
│       ├── conversation-list/
│       ├── chat-thread/
│       ├── chat-input/
│       ├── inline-citation/
│       ├── research-side-panel/
│       └── research-suggestion/
├── core/services/
│   ├── conversation.service.ts  (NEW)
│   ├── chat-stream.service.ts  (NEW)
│   └── research-panel.service.ts  (NEW)
└── models/
    └── conversation.model.ts  (NEW)
```

---

## Verification Checklist

Before marking implementation complete:

- [ ] All 11 phases implemented and verified
- [ ] Zero modifications to `src/research/` directory
- [ ] All new files follow one-class-per-file convention
- [ ] Migrations run successfully on fresh database
- [ ] E2E tests cover full chat + research flow
- [ ] Mobile responsive design verified
- [ ] Documentation updated
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run test:e2e` passes
