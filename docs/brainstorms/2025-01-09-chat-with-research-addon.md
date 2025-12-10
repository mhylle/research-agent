# Brainstorm: Chat Application with Research Addon

**Date**: 2025-01-09
**Status**: Ready for Planning

## Executive Summary

Transform the research agent into a chat-first application where users can have continuous conversations with the LLM, with the ability to toggle research mode on a per-message basis. Research becomes an "addon" service that the chat module can invoke, preserving all existing research functionality while adding conversational capabilities with full persistence, inline citations, and context-aware follow-up questions.

## Idea Evolution

### Original Concept

> "I want to change the system to become more of a chat application, where we chat with the llm. Then you should be able to turn on or off the research mode. I.e. we need to keep the current research application, but we also want a chat application, and the research should be an 'addon' to the chat module."

### Refined Understanding

Through Socratic exploration, the concept evolved into a comprehensive chat platform where:
- Chat is the primary interface with continuous conversation threads
- Research is a per-message toggle (not session-wide) that users explicitly enable
- The system suggests research when queries would benefit, but never auto-enables
- Conversation context is passed to research pipeline for context-aware queries
- All interactions (chat + research) are persisted with full logging of tokens/timing
- Inline citations (Perplexity-style) with collapsible side panel for details
- Existing research/logs dashboards remain as power-user views

### Key Clarifications Made

- **Research trigger**: User must submit a message with research enabled; toggle alone doesn't start research
- **Context handling**: LLM-summarized context + user can select specific messages to include
- **Response flow**: LLM waits for research completion, then streams final answer with integrated sources
- **Concurrent research**: One research operation at a time; chat continues but subsequent research queued
- **Message editing**: Supported with replacement (original logged for audit)
- **Toggle state**: Resets to OFF after each message (explicit opt-in)
- **Persistence**: Everything saved to database - conversations, messages, research data, tokens, timing

## Analysis Results

### Strengths (Yellow Hat)

- **Natural evolution**: Current research UI is already chat-like; this formalizes and extends that pattern
- **Proven patterns**: Perplexity, ChatGPT demonstrate chat+research works at massive scale
- **Reusable infrastructure**: EventEmitter2, SSE streaming, pluggable LLM providers all support this
- **Isolated research pipeline**: Can be called as service without modification (3-stage pipeline preserved)
- **Modern frontend**: Angular Signals and standalone components ready for chat UI patterns
- **Comprehensive logging**: Existing infrastructure just needs new event types
- **User mental model**: Chat-first matches how users naturally interact with AI assistants

### Risks & Concerns (Black Hat + Premortem)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Context window overflow in long conversations | High | High | Hierarchical summarization with user-configurable scope limits; token budget tracking per conversation |
| Breaking existing research pipeline during integration | Medium | High | Keep research module completely separate; create new chat module that calls research as service; comprehensive test coverage |
| SSE reliability with dual streams (chat + research) | Medium | Medium | Use separate, independent streams; implement heartbeat and auto-reconnect; add connection status indicator |
| Token costs escalating with summarization overhead | Medium | Medium | Use smaller/faster model for summarization (configurable); cache summaries; only summarize when threshold exceeded |
| User confusion about research toggle behavior | Low | Medium | Clear visual indicator of research state; "Research this" button per message; assistant verbally suggests when helpful |
| Migration corrupting existing data | Low | High | Create new tables only (Conversation, Message); don't modify existing schemas; link via foreign keys |

### Gaps Identified

- [ ] **Conversation entity** - Need new `ConversationEntity` with title, metadata, timestamps, user reference
- [ ] **Message persistence** - Need new `MessageEntity` linked to conversations with role, content, options, research link
- [ ] **Context summarization service** - Need `ConversationContextService` with configurable model for compressing history
- [ ] **Chat SSE streaming** - Need `/api/chat/stream/:messageId` endpoint for LLM token streaming
- [ ] **Conversation management API** - Need REST endpoints for CRUD + search across conversations
- [ ] **Chat UI components** - Need conversation list, message thread, input with toggle, citation rendering
- [ ] **Inline citation component** - Need numbered reference rendering with click-to-expand side panel
- [ ] **Research suggestion system** - Need detection logic and UI for "Research this" button on applicable messages

### Enhancement Opportunities (SCAMPER)

- **Substitute**: Replace research-only UI with chat as primary interface
- **Combine**: Chat streaming + research progress into unified UX; LogEntry + Message via FK
- **Adapt**: Perplexity's inline citation pattern; ChatGPT's conversation management UI
- **Modify**: Research pipeline to accept conversation context as optional parameter
- **Put to other use**: Existing knowledge graph for visualizing conversation flow
- **Eliminate**: Manual mode switching (replaced by per-message toggle + suggestions)
- **Reverse**: Research becomes a service called by chat, not standalone feature

### Premortem Findings

- **Failure mode**: Context became incoherent after 50+ messages → **Prevention**: Implement hierarchical summarization; add visual token budget indicator; allow user to limit context scope
- **Failure mode**: Research pipeline broke after chat integration → **Prevention**: Zero modifications to research module; create clean interface boundary; extensive integration tests
- **Failure mode**: SSE connections dropped frequently → **Prevention**: Separate streams per concern; heartbeat mechanism; exponential backoff reconnect; visual connection status
- **Failure mode**: Token costs 5x higher than expected → **Prevention**: Smaller summarization model; aggressive caching; only summarize past threshold; track costs per conversation
- **Failure mode**: Users kept forgetting to enable research → **Prevention**: Proactive "Research this" button; assistant suggests in response; visual cue when query seems research-worthy

## Structured Concept

### Component 1: Conversation Module (Backend)

**Purpose**: Manage conversation lifecycle, message persistence, and context orchestration

**Scope**:
- `ConversationEntity` with id, userId, title, summary, createdAt, updatedAt, tokenCount
- `MessageEntity` with id, conversationId, role, content, messageOptions, researchLogId, citations, tokenCount, createdAt, editedAt
- `ConversationService` for CRUD operations, search, context retrieval
- `ConversationController` with REST endpoints

**Dependencies**: TypeORM, LoggingModule, ResearchModule (as service)

**Key Decisions**:
- New tables only - no modifications to existing LogEntry/ResearchResult
- Link to research via `researchLogId` foreign key on Message
- Store both full content and summary for long conversations

### Component 2: Context Management Service (Backend)

**Purpose**: Manage conversation context for LLM calls, including summarization and scope limiting

**Scope**:
- `ConversationContextService` for building context from message history
- Hierarchical summarization when token count exceeds threshold (configurable, default 50%)
- User-selectable message inclusion (pinning/highlighting)
- Token counting and budget tracking per conversation

**Dependencies**: LLMModule (for summarization), ConversationModule

**Key Decisions**:
- Configurable summarization model (can be different from main chat model)
- Cache summaries to avoid redundant LLM calls
- Provide both "recent messages" and "summarized history" to LLM

### Component 3: Chat Streaming (Backend)

**Purpose**: Stream LLM responses token-by-token to frontend

**Scope**:
- `ChatStreamController` with `GET /api/chat/stream/:messageId` SSE endpoint
- Integration with LLM provider's streaming capabilities
- Event emission for chat tokens (separate from research events)

**Dependencies**: LLMModule, ConversationModule, EventEmitter2

**Key Decisions**:
- Separate SSE endpoint from research streaming (different concerns)
- Stream waits for research completion before starting (when research enabled)
- Include citation metadata in stream completion event

### Component 4: Research Integration Layer (Backend)

**Purpose**: Bridge between chat and existing research pipeline

**Scope**:
- `ChatResearchService` that prepares context and calls existing research pipeline
- Context injection from conversation history into research query
- Citation extraction and formatting for inline display
- Research status tracking (one at a time per conversation)

**Dependencies**: ResearchModule (existing), ConversationContextService

**Key Decisions**:
- Zero modifications to existing research pipeline
- Wrapper service handles context preparation
- Research results linked to messages via logId

### Component 5: Chat UI (Frontend)

**Purpose**: Primary user interface for conversations

**Scope**:
- `ConversationListComponent` - sidebar with conversation history, search, new/delete
- `ChatThreadComponent` - message display with inline citations
- `ChatInputComponent` - input field with research toggle, send button
- `CitationComponent` - numbered inline references with expandable details
- `ResearchSidePanelComponent` - collapsible panel showing research details, sources, knowledge graph

**Dependencies**: Angular Material, existing ResearchService patterns, D3.js for graphs

**Key Decisions**:
- Chat on right side of screen (redesign from current layout)
- Side panel collapses on mobile into expandable sections
- Research toggle resets to OFF after each message
- "Research this" button appears on messages detected as research-worthy

### Component 6: Conversation Management (Frontend)

**Purpose**: CRUD operations for conversations

**Scope**:
- `ConversationService` - API communication for conversations
- Create, rename, delete conversations
- Search across conversation history
- Auto-generate titles from first message

**Dependencies**: HttpClient, Angular Signals for state

**Key Decisions**:
- Conversations persist indefinitely (user-controlled deletion)
- Title auto-generated via LLM, editable by user
- Search uses existing full-text search infrastructure

## Research Findings

### External Best Practices

**From Perplexity AI (market leader)**:
- Five-stage RAG pipeline with progressive ranking (fast scorers → expensive rerankers)
- Model-agnostic strategy enables cost optimization and vendor flexibility
- Thread system stores full conversation with automatic context management
- Focus on orchestration logic, not reinventing search infrastructure
- Source: [Perplexity Technical Deep Dive](https://www.graphapp.ai/blog/perplexity-technical-deep-dive-understanding-the-complexities)

**From Industry Research**:
- Hierarchical summarization achieves 80-90% token reduction with 26% quality improvement vs basic history
- "Lost in the middle" bias: place critical information at start/end of context
- SSE preferred over WebSocket for unidirectional streaming (simpler, auto-reconnect)
- Store individual messages, not JSON blobs (enables querying, indexing, partial updates)
- Persist after each LLM response (don't wait until conversation end)
- Source: [LLM Chat History Summarization Guide](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)

**Citation UX**:
- Inline numbered citations (Perplexity pattern) most trusted by users
- 3-6 citations per response optimal balance
- Click-to-expand for full source details
- Validate URLs before displaying (prevents hallucinated citations)
- Source: [Guide to AI Chatbots Best UX Practices](https://www.mockplus.com/blog/post/guide-to-ai-chatbots-best-practices-examples)

### Anti-Patterns to Avoid

1. **Bot loops without escalation** - Implement fallback detection (3 failed attempts → alternatives)
2. **Storing history as JSON blob** - Use individual message rows with foreign keys
3. **Waiting until end to persist** - Save after each LLM response
4. **No token management** - Track tokens per message, implement summarization triggers
5. **Missing citation validation** - Validate URLs exist before displaying
6. **Over-relying on large context windows** - Use retrieval and targeted prompts instead

### Codebase Context

**Relevant Files for Extension**:
- `src/research/research.service.ts:31-38` - Entry point for research, can be called as service
- `src/research/research-stream.controller.ts:37-114` - SSE pattern to follow for chat streaming
- `src/llm/llm.service.ts:51-72` - LLM abstraction with concurrency control, reusable
- `src/logging/log.service.ts:118-156` - Event persistence pattern to extend
- `client/src/app/core/services/research.service.ts:7-26` - Angular Signals pattern to follow

**Existing Patterns to Follow**:
- Module structure: TypeORM.forFeature, controllers, services, exports
- SSE: Observable<MessageEvent> with EventEmitter2 pub/sub
- Entity: @PrimaryColumn('uuid'), @Index() on query fields, simple-json for objects
- Service injection: constructor-based, @Injectable()
- Frontend state: Angular Signals with .set() and .update()

**Integration Points**:
- `ResearchService.executeResearch()` - call from ChatResearchService with context
- `LogService.append()` - extend event types for chat events
- `EventEmitter2` - add chat.* event namespace
- `research-stream.controller.ts` pattern - duplicate for chat streaming

## API Design

### REST Endpoints

```
# Conversation Management
POST   /api/conversations                    # Create new conversation
GET    /api/conversations                    # List conversations (paginated, searchable)
GET    /api/conversations/:id                # Get conversation with messages
PATCH  /api/conversations/:id                # Update title, etc.
DELETE /api/conversations/:id                # Delete conversation

# Message Management
POST   /api/conversations/:id/messages       # Send message (body includes researchEnabled flag)
PATCH  /api/messages/:id                     # Edit message (triggers re-run)
GET    /api/messages/:id/research            # Get research data for message

# SSE Streaming
GET    /api/chat/stream/:messageId           # Stream LLM response tokens
GET    /api/research/stream/:logId           # Existing research progress (unchanged)
```

### Data Models

```typescript
// ConversationEntity
@Entity('conversations')
class ConversationEntity {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') @Index() userId: string;
  @Column('text') title: string;
  @Column('text', { nullable: true }) summary: string;
  @Column('int', { default: 0 }) tokenCount: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

// MessageEntity
@Entity('messages')
class MessageEntity {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') @Index() conversationId: string;
  @Column('varchar', { length: 20 }) role: 'user' | 'assistant' | 'system';
  @Column('text') content: string;
  @Column('simple-json') messageOptions: MessageOptions;
  @Column('uuid', { nullable: true }) researchLogId: string;
  @Column('simple-json', { nullable: true }) citations: Citation[];
  @Column('int') tokenCount: number;
  @CreateDateColumn() createdAt: Date;
  @Column('timestamp', { nullable: true }) editedAt: Date;
}

// MessageOptions
interface MessageOptions {
  researchEnabled: boolean;
  contextScope?: 'recent' | 'full' | 'custom';
  selectedMessageIds?: string[];
}

// Citation
interface Citation {
  index: number;
  url: string;
  title: string;
  snippet: string;
}
```

## Recommended Next Steps

1. **Create database migrations** for Conversation and Message entities
2. **Implement ConversationModule** with basic CRUD operations
3. **Implement ConversationContextService** with summarization
4. **Create ChatStreamController** following research-stream pattern
5. **Implement ChatResearchService** as bridge to existing research
6. **Build frontend ConversationListComponent** and ChatThreadComponent
7. **Add inline citation rendering** with side panel
8. **Implement research suggestion system** ("Research this" button)
9. **Add comprehensive tests** for new modules
10. **Migrate frontend to chat-first layout**

## Ready for Create-Plan

**Yes**

The concept is well-defined with clear architectural boundaries, data models, API design, and integration points. All major decisions have been made through Socratic exploration and validated against industry best practices.

### Suggested Plan Scope

**Primary Deliverables**:
- Backend: ConversationModule, ConversationContextService, ChatStreamController, ChatResearchService
- Frontend: Chat UI components, conversation management, inline citations, side panel
- Database: New migrations for Conversation and Message entities
- Integration: Research as service, dual SSE streams, full logging

**Key Phases to Consider**:
1. Database schema and migrations
2. Backend conversation CRUD
3. Backend context management and summarization
4. Backend chat streaming
5. Research integration layer
6. Frontend conversation management
7. Frontend chat thread and input
8. Frontend citation and side panel
9. Research suggestion system
10. Testing and polish

**Critical Success Factors**:
- Zero modifications to existing research pipeline
- Full persistence of all interactions
- Reliable SSE streaming with reconnection
- Intuitive research toggle UX
- Inline citations with source verification
