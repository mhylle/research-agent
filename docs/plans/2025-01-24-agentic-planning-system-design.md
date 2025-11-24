# Agentic Planning System Design

**Date:** 2025-01-24
**Branch:** `feature/agentic-planning-system`
**Status:** Approved

## Overview

Transform the research agent from a fixed 3-stage pipeline into a true agentic system with:
- **Planning Phase**: LLM analyzes query and creates execution plan using tools
- **Dynamic Re-planning**: Plan adapts at phase boundaries and on failures
- **Comprehensive Logging**: Immutable, append-only logs capturing everything
- **Real-time UI**: SSE streaming of all events for live progress tracking

## Design Decisions

| Aspect | Decision |
|--------|----------|
| Plan Granularity | Atomic operations (smallest steps) |
| Execution Model | Dynamic re-planning |
| Re-plan Triggers | Phase boundaries + failures |
| Plan Structure | Hierarchical (Phases → Steps) |
| Orchestrator | Single orchestrator, extensible for nesting |
| Logging | Immutable, append-only, separate from plan |
| Planner Interface | Tool-based (LLM uses tools to build plan) |
| Tool Awareness | Planner knows available executor tools |
| Re-plan Context | Summary + query tools for details |
| Integration | Replace current pipeline (on feature branch) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Request                                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PLANNER LLM                                     │
│  • Receives: query + available tools                                 │
│  • Uses planning tools to construct Plan                             │
│  • Each tool call = log entry                                        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         PLAN                                         │
│  Phases: [                                                           │
│    { name: "search", steps: [...], replanCheckpoint: true },         │
│    { name: "fetch", steps: [...], replanCheckpoint: true },          │
│    { name: "synthesize", steps: [...] }                              │
│  ]                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                                    │
│  • Executes plan phase by phase                                      │
│  • Dispatches steps to appropriate Executors                         │
│  • At replan checkpoints → calls Planner for re-evaluation           │
│  • On failure → calls Planner for recovery decision                  │
│  • Every action → emits immutable log entry                          │
└─────────────────────────────────────────────────────────────────────┘
                    │                    │
          ┌────────┴────────┐           │
          ▼                 ▼           ▼
   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
   │ LLM Executor│   │Tool Executor│   │Future Exec. │
   │ (synthesis) │   │(tavily,fetch)│  │ (extensible)│
   └─────────────┘   └─────────────┘   └─────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    IMMUTABLE LOG STORE                               │
│  • Every event persisted: plan creation, step start/complete/fail    │
│  • Tokens, timing, inputs, outputs, prompts - ALL captured           │
│  • SSE stream for real-time UI                                       │
│  • Query interface for post-mortem analysis                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Data Structures

### Plan Structures

```typescript
interface Plan {
  id: string;
  query: string;
  status: 'planning' | 'executing' | 'replanning' | 'completed' | 'failed';
  phases: Phase[];
  createdAt: Date;
  completedAt?: Date;
}

interface Phase {
  id: string;
  planId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  steps: PlanStep[];
  replanCheckpoint: boolean;
  order: number;
}

interface PlanStep {
  id: string;
  phaseId: string;
  type: 'tool_call' | 'llm_call';
  toolName: string;
  config: Record<string, any>;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  order: number;
}
```

### Log Structures

```typescript
interface LogEntry {
  id: string;
  logId: string;
  timestamp: Date;
  eventType: LogEventType;
  planId?: string;
  phaseId?: string;
  stepId?: string;
  data: {
    input?: any;
    output?: any;
    prompt?: string;
    tokensUsed?: { prompt: number; completion: number; total: number };
    durationMs?: number;
    error?: { message: string; code?: string; stack?: string };
    metadata?: Record<string, any>;
  };
}

type LogEventType =
  | 'plan_created' | 'phase_added' | 'step_added' | 'step_modified' | 'step_removed'
  | 'phase_started' | 'phase_completed' | 'phase_failed'
  | 'step_started' | 'step_completed' | 'step_failed' | 'step_skipped'
  | 'replan_triggered' | 'replan_completed'
  | 'session_started' | 'session_completed' | 'session_failed';
```

## Planning Tools

The Planner LLM uses these tools to construct and modify plans:

```typescript
const planningTools = [
  // Creation
  'create_plan',      // Initialize a new plan
  'add_phase',        // Add a phase with optional replan checkpoint
  'add_step',         // Add atomic step to a phase

  // Modification (re-planning)
  'modify_step',      // Change step config
  'remove_step',      // Remove pending step
  'skip_phase',       // Skip entire phase
  'insert_phase_after', // Add new phase during re-planning

  // Querying
  'get_plan_status',  // Get current plan state
  'get_phase_results', // Get detailed phase results

  // Finalization
  'finalize_plan',    // Mark planning complete
];

const recoveryTools = [
  'retry_step',       // Retry with optional modified config
  'skip_step',        // Skip and continue
  'replace_step',     // Use alternative approach
  'abort_plan',       // Unrecoverable failure
];
```

## Module Structure

```
src/
├── orchestration/                    # NEW - Core agentic system
│   ├── orchestration.module.ts
│   ├── orchestrator.service.ts
│   ├── planner.service.ts
│   ├── executor-registry.service.ts
│   ├── interfaces/
│   │   ├── plan.interface.ts
│   │   ├── phase.interface.ts
│   │   ├── plan-step.interface.ts
│   │   ├── executor.interface.ts
│   │   └── recovery.interface.ts
│   └── tools/
│       ├── planning-tools.ts
│       └── recovery-tools.ts
│
├── executors/                        # NEW - Step executors
│   ├── executors.module.ts
│   ├── tool.executor.ts
│   ├── llm.executor.ts
│   └── interfaces/
│       └── executor-result.interface.ts
│
├── logging/                          # ENHANCED
│   ├── logging.module.ts
│   ├── log.service.ts
│   ├── log-entry.entity.ts
│   └── interfaces/
│       ├── log-entry.interface.ts
│       └── log-query.interface.ts
│
├── research/                         # MODIFIED
│   ├── research.module.ts
│   ├── research.service.ts           # Delegates to Orchestrator
│   ├── research.controller.ts
│   └── research-stream.controller.ts
│
├── tools/                            # EXISTING - unchanged
└── llm/                              # EXISTING - unchanged
```

## Key Flows

### Planning Flow

1. User submits query
2. Orchestrator calls `plannerService.createPlan(query)`
3. Planner LLM receives query + available executor tools
4. Planner iteratively calls planning tools: `create_plan` → `add_phase` → `add_step` → ... → `finalize_plan`
5. Each tool call logged immediately
6. Returns structured `Plan` object

### Execution Flow

1. Orchestrator iterates through phases
2. For each phase: build execution queue respecting dependencies
3. Execute steps (parallel where possible) via appropriate Executor
4. Log every step start/complete/fail
5. At replan checkpoints: call Planner with results summary
6. On failure: call Planner for recovery decision
7. Continue until all phases complete or abort

### Re-planning Flow

1. Phase completes with `replanCheckpoint: true`
2. Orchestrator builds summary context
3. Planner receives: query, plan summary, phase results
4. Planner can call: `add_step`, `remove_step`, `skip_phase`, etc.
5. Modified plan continues execution

### Recovery Flow

1. Step fails
2. Orchestrator builds failure context
3. Planner decides: `retry_step`, `skip_step`, `replace_step`, or `abort_plan`
4. Action executed, logged, and flow continues

## Logging Principles

- **Immutable**: Logs are write-once, never modified or deleted
- **Complete**: Every state change emits a log entry
- **Queryable**: Rich query interface for post-mortem analysis
- **Streamable**: SSE for real-time UI updates
- **Flexible**: JSONB `data` field captures any payload

## Database Migration

New table: `log_entries`

```sql
CREATE TABLE log_entries (
  id UUID PRIMARY KEY,
  log_id UUID NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  plan_id UUID,
  phase_id UUID,
  step_id UUID,
  data JSONB NOT NULL
);

CREATE INDEX idx_log_entries_log_id ON log_entries(log_id);
CREATE INDEX idx_log_entries_timestamp ON log_entries(timestamp);
CREATE INDEX idx_log_entries_event_type ON log_entries(event_type);
CREATE INDEX idx_log_entries_data_gin ON log_entries USING GIN (data);
```

## Future Extensibility

- **Nested Orchestrators**: Phase-level orchestrators can be added without changing core design
- **New Executors**: Register new executor types via `ExecutorRegistry`
- **Additional Tools**: Add new planning/execution tools as needed
- **External Services**: New executors can wrap external APIs, databases, etc.
