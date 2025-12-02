# Evaluation Mechanism Design

**Date**: 2025-11-27
**Status**: Draft
**Author**: Collaborative Design Session

## Overview

The Evaluation Mechanism validates research quality at runtime and analyzes results offline to improve the system. It operates as a fail-safe addon: if evaluation fails, research continues uninterrupted.

### Goals

1. **Runtime evaluation**: Validate plans before execution, iterate to improve quality
2. **Offline evaluation**: Analyze historical results, generate prompt improvement suggestions
3. **Quality gating**: Catch poor results before returning to users
4. **Comparative analysis**: Compare models, parameters, and configurations

### Design Principles

- **Persist everything**: Space is cheap, missing data is expensive
- **Fail-safe**: Evaluation enhances but never blocks core research
- **Shift-left**: Catch problems at planning stage, not after synthesis

---

## Architecture

### Dual-Mode System

```
┌─────────────────────────────────────────────────────────────────┐
│                     RUNTIME EVALUATION                          │
│  Runs during query execution, validates at three checkpoints    │
└─────────────────────────────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│    PLAN     │      │  RETRIEVAL  │      │   ANSWER    │
│ EVALUATION  │      │ EVALUATION  │      │ EVALUATION  │
│             │      │             │      │             │
│ • Iterates  │      │ • Logs      │      │ • Regen on  │
│   until     │      │ • Flags     │      │   major     │
│   pass      │      │   severe    │      │   failure   │
└─────────────┘      └─────────────┘      └─────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     OFFLINE EVALUATION                          │
│  On-demand analysis of historical results for system improvement│
│  • Aggregate metrics    • Pattern detection                     │
│  • Prompt suggestions   • Failure analysis                      │
└─────────────────────────────────────────────────────────────────┘
```

### Pipeline Integration

```
User Query
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 1: Plan Generation                                        │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ PLAN EVALUATION (Iteration Loop)                                │
│  1. Panel of role-based small models evaluate in parallel       │
│  2. Aggregate scores weighted by evaluator confidence           │
│  3. Escalate to larger model if uncertain                       │
│  4. Iterate with critique feedback until pass OR max 3 attempts │
└─────────────────────────────────────────────────────────────────┘
    │ (passed)
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 2: Search & Fetch → RETRIEVAL EVALUATION (log + flag)     │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 3: Synthesis → ANSWER EVALUATION (regen if major fail)    │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
Final Answer + Evaluation Scores + Full Trace Persisted
```

---

## Evaluation Dimensions

### Plan Evaluation (Stage 1)

Primary iteration point. Validates the research plan before execution.

| Dimension | Weight | Threshold | Description |
|-----------|--------|-----------|-------------|
| Intent Alignment | 50% | < 0.7 → always iterate | Does the plan correctly interpret what the user wants? |
| Query Coverage | 35% | < 0.6 → iterate | Do search queries cover all aspects of the question? |
| Scope Appropriateness | 15% | < 0.5 → iterate if borderline | Is the plan too narrow or too broad? |

**Pass threshold**: 0.7 overall (configurable)

### Retrieval Evaluation (Stage 2)

Assesses retrieval quality. Logs results and flags severe failures to user.

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Context Recall | 40% | Did we retrieve all documents needed to answer fully? |
| Context Precision | 35% | Are retrieved documents actually relevant? |
| Source Quality | 25% | Authority, recency, credibility of sources |

**Behavior**: Log by default, flag severe failures (< 0.5) to user for notification.

### Answer Evaluation (Stage 3)

Evaluates final synthesis. Regenerates for major failures only.

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Faithfulness | 30% | Is the answer grounded in sources? (no hallucination) |
| Relevance | 25% | Does the answer address what the user asked? |
| Factual Accuracy | 20% | Is the information actually correct? |
| Completeness | 15% | Does it cover all aspects with sufficient depth? |
| Coherence | 10% | Logical flow, organization, readability |

**Behavior**: Regenerate synthesis (Stage 3 only) for scores < 0.5.

---

## LLM Panel Architecture

### Role-Based Evaluators

Each evaluation dimension uses a specialized model role:

| Role | Dimensions | Model Characteristics |
|------|-----------|----------------------|
| Intent Analyst | Intent Alignment, Relevance | Strong instruction-following |
| Coverage Checker | Query Coverage, Completeness, Context Recall | Systematic, thorough |
| Faithfulness Judge | Faithfulness, Context Precision | Source comparison, hallucination detection |
| Quality Assessor | Coherence, Source Quality | Writing awareness, credibility judgment |
| Fact Checker | Factual Accuracy | Broad knowledge, skeptical reasoning |

### Model Assignments

Default assignments using available Ollama models:

```yaml
evaluators:
  intent_analyst:
    model: "llama3.1:8b"
  coverage_checker:
    model: "qwen3:14b"
  faithfulness_judge:
    model: "llama3.1:8b"
  quality_assessor:
    model: "qwen3:14b"
  fact_checker:
    model: "qwen3:14b"

escalation_model: "qwen3:30b"

# Optional: Visual content evaluation
visual_evaluator: "qwen3-vl:8b"
```

Users can override these assignments in configuration.

### Aggregation

1. Each role evaluates its dimensions in parallel
2. Each returns: `{ scores, confidence (0-1), critique }`
3. Final score = weighted average: `dimension_weight × evaluator_confidence × score`

### Escalation to Larger Model

**Triggers** (any of):
- Low confidence: All evaluators report confidence < 0.6
- High disagreement: Scores differ by > 0.3
- Borderline: Aggregated score within 0.05 of pass threshold

**Larger model behavior**:
1. Reviews panel's scores and critiques (meta-evaluation)
2. Decides which evaluators to trust
3. Synthesizes final verdict with explanation

---

## Iteration Strategy

### Iteration Flow

```
Plan Generated
      │
      ▼
┌─────────────────────────────────────────┐
│ Panel Evaluation                        │
│  • Role-based evaluators score plan     │
│  • Aggregate with confidence weighting  │
│  • Check escalation triggers            │
└─────────────────────────────────────────┘
      │
      ▼
   Passed? ────Yes────► Proceed to Stage 2
      │
      No
      │
      ▼
┌─────────────────────────────────────────┐
│ Critic Feedback                         │
│  • Identify specific issues             │
│  • Recommend iteration mode             │
│  • Generate feedback for planner        │
└─────────────────────────────────────────┘
      │
      ▼
   Attempt < 3? ────No────► Use best attempt, proceed
      │
      Yes
      │
      ▼
┌─────────────────────────────────────────┐
│ Iterate                                 │
│  • targeted_fix: Fix specific issues    │
│  • full_regeneration: Redo with context │
│  • alternative_approach: New strategy   │
└─────────────────────────────────────────┘
      │
      └───────► Back to Panel Evaluation
```

### Critic Feedback Structure

```json
{
  "passed": false,
  "scores": {
    "intent_alignment": 0.6,
    "query_coverage": 0.8,
    "scope_appropriateness": 0.7
  },
  "failure_type": "intent_misalignment",
  "critique": "Plan focuses on 'quantum computing history' but user asked about 'latest developments'. Missing temporal focus.",
  "recommendation": "targeted_fix",
  "specific_issues": [
    {
      "issue": "search queries lack recency filters",
      "fix": "add '2024' or 'recent' to queries"
    },
    {
      "issue": "missing 'breakthroughs' angle",
      "fix": "add query for recent breakthroughs"
    }
  ]
}
```

### Iteration Modes

| Mode | When Used | Behavior |
|------|-----------|----------|
| `targeted_fix` | Minor issues, specific gaps | Regenerate only failing components with guidance |
| `full_regeneration` | Multiple issues, unclear fix | Redo entire plan with critique context |
| `alternative_approach` | Fundamental misunderstanding | Request completely different strategy |

### Escalation Rules

- **Attempt 1 fails**: Use critic's recommended mode
- **Attempt 2 fails**: Escalate to `full_regeneration`
- **Attempt 3 fails**: Escalate to qwen3:30b for meta-evaluation, proceed with best attempt

### Configuration

```yaml
iteration:
  max_attempts: 3
  timeout_per_attempt: 60000  # 60 seconds
  escalation_after_attempt: 2
```

---

## Data Persistence

### Philosophy

Persist everything. Space is cheap, missing data is expensive. No bit of data is irrelevant.

### Evaluation Record Schema

```typescript
interface EvaluationRecord {
  // Identity
  logId: string;
  queryId: string;
  timestamp: string;
  userQuery: string;

  // Plan Evaluation
  planEvaluation: {
    attempts: PlanAttempt[];
    finalScores: DimensionScores;
    passed: boolean;
    totalIterations: number;
    escalatedToLargeModel: boolean;
  };

  // Retrieval Evaluation
  retrievalEvaluation: {
    scores: DimensionScores;
    passed: boolean;
    flaggedSevere: boolean;
    sourceDetails: SourceEvaluation[];
  };

  // Answer Evaluation
  answerEvaluation: {
    attempts: AnswerAttempt[];
    finalScores: DimensionScores;
    passed: boolean;
    regenerated: boolean;
  };

  // Overall
  overallScore: number;
  evaluationSkipped: boolean;
  skipReason?: string;
}

interface PlanAttempt {
  attemptNumber: number;
  timestamp: string;
  plan: GeneratedPlan;

  // Per-evaluator results
  evaluatorResults: EvaluatorResult[];

  // Aggregation
  aggregatedScores: DimensionScores;
  aggregatedConfidence: number;
  passed: boolean;

  // Escalation (if triggered)
  escalation?: EscalationResult;

  // Iteration decision (if failed)
  iterationDecision?: IterationDecision;
}

interface EvaluatorResult {
  role: string;
  model: string;
  dimensions: string[];
  scores: DimensionScores;
  confidence: number;
  critique: string;
  rawResponse: string;
  latency: number;
  tokensUsed: number;
}

interface EscalationResult {
  trigger: 'low_confidence' | 'disagreement' | 'borderline';
  model: string;
  panelReview: string;
  trustDecisions: Record<string, number>;
  finalVerdict: string;
  scores: DimensionScores;
  latency: number;
  tokensUsed: number;
}

interface IterationDecision {
  mode: 'targeted_fix' | 'full_regeneration' | 'alternative_approach';
  specificIssues: Issue[];
  feedbackToPlanner: string;
}

interface DimensionScores {
  [dimension: string]: number;
}
```

### Storage Structure

```
data/
└── evaluations/
    └── {logId}/
        ├── evaluation.json      # Full evaluation record
        ├── plan_attempts/
        │   ├── attempt_1.json   # Complete attempt data
        │   ├── attempt_2.json
        │   └── attempt_3.json
        └── evaluator_responses/
            ├── intent_analyst.json
            ├── coverage_checker.json
            └── ...
```

---

## Graceful Degradation

### Principle

Evaluation is advisory, not blocking. Core research always completes.

### Fail-Safe Wrapper

```typescript
async evaluateWithFallback<T>(
  evaluationFn: () => Promise<EvaluationResult>,
  fallback: EvaluationResult,
  context: string
): Promise<EvaluationResult> {
  if (!this.config.evaluationEnabled) {
    return fallback;
  }

  try {
    const result = await Promise.race([
      evaluationFn(),
      this.timeout(this.config.evaluationTimeout)
    ]);
    return result;
  } catch (error) {
    this.logger.warn(`Evaluation failed (${context}), continuing`, {
      error: error.message,
      context
    });

    await this.persistEvaluationError(context, error);

    return {
      ...fallback,
      evaluationSkipped: true,
      skipReason: error.message
    };
  }
}
```

### Configuration

```yaml
evaluation:
  enabled: true

  planEvaluation:
    enabled: true
    iterationEnabled: true
    maxAttempts: 3
    timeout: 60000
    failAction: "continue"  # continue | warn | block

  retrievalEvaluation:
    enabled: true
    timeout: 30000
    failAction: "continue"

  answerEvaluation:
    enabled: true
    regenerationEnabled: true
    timeout: 45000
    failAction: "continue"
```

### Failure Behavior

| Scenario | Behavior |
|----------|----------|
| Evaluator model unavailable | Log warning, skip evaluation, proceed |
| Evaluation timeout | Log warning, use partial results or skip |
| Score parsing error | Log error, assume pass, proceed |
| Iteration loop error | Log error, use best attempt so far |
| Persistence error | Log error, continue (evaluation still runs) |

---

## Runtime UI

### Progressive Disclosure

**Default view (summary)**:
```
┌─────────────────────────────────────────────────────────┐
│ 🔍 Stage 1: Planning                                    │
│ ████████████████████░░░░░░░░░░  Evaluating plan (2/3)  │
│                                                         │
│ Plan Score: 0.82 ✓                    [Show details ▼] │
└─────────────────────────────────────────────────────────┘
```

**Expanded view (on click)**:
```
┌─────────────────────────────────────────────────────────┐
│ 🔍 Stage 1: Planning                                    │
├─────────────────────────────────────────────────────────┤
│ Attempt 1/3                                    ❌ Failed │
│ ├─ Intent Alignment:    0.58  ██████░░░░ (threshold 0.7)│
│ ├─ Query Coverage:      0.81  ████████░░               │
│ └─ Scope:               0.72  ███████░░░               │
│                                                         │
│ Critique: "Plan focuses on general quantum computing    │
│ but user asked specifically about 2024 breakthroughs.   │
│ Missing temporal focus and 'breakthrough' angle."       │
│                                                         │
│ → Iterating with targeted fix...                        │
├─────────────────────────────────────────────────────────┤
│ Attempt 2/3                                    ✓ Passed │
│ ├─ Intent Alignment:    0.87  █████████░               │
│ ├─ Query Coverage:      0.85  █████████░               │
│ └─ Scope:               0.78  ████████░░               │
│                                                         │
│ Final Plan Score: 0.85                                  │
└─────────────────────────────────────────────────────────┘
```

**Evaluation skipped notification**:
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Plan evaluation skipped (model timeout)              │
│ Research continued without quality validation           │
│ [View error details]                                    │
└─────────────────────────────────────────────────────────┘
```

**Severe failure notification**:
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Retrieval Quality Warning                            │
│ Context Recall: 0.42 - May be missing key sources       │
│ [View details] [Proceed anyway] [Retry search]          │
└─────────────────────────────────────────────────────────┘
```

---

## Offline Dashboard

**Route**: `/evaluation`

### 1. Aggregate Metrics View

```
┌─────────────────────────────────────────────────────────┐
│ 📊 Evaluation Overview                    Last 30 days │
├─────────────────────────────────────────────────────────┤
│ Total Queries: 247    Pass Rate: 78%    Avg Score: 0.81│
│                                                         │
│ Score Distribution          Failure by Dimension        │
│ ┌────────────────┐          ┌────────────────────────┐ │
│ │   ▁▂▅▇█▇▅▂▁   │          │ Intent:      ████░ 23% │ │
│ │ 0.4  0.7  1.0 │          │ Faithfulness: ██░░ 12% │ │
│ └────────────────┘          │ Coverage:     █░░░  8% │ │
│                             └────────────────────────┘ │
│ Trend (weekly)              Iteration Stats             │
│ ┌────────────────┐          • Avg iterations: 1.4      │
│ │    ╱──╲__╱─    │          • Escalations: 12%         │
│ │   ╱          ─ │          • Max attempts hit: 5%     │
│ └────────────────┘                                      │
└─────────────────────────────────────────────────────────┘
```

### 2. Query Explorer View

- Browse all queries with evaluation scores
- Filter by: score range, failure type, date, escalated, iteration count
- Click to see full evaluation trace
- Compare before/after for iterated queries

### 3. Pattern Detector View

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 Detected Patterns                                    │
├─────────────────────────────────────────────────────────┤
│ ⚠️ HIGH IMPACT                                          │
│ "Queries containing 'latest' or 'recent' consistently  │
│  fail Intent Alignment (avg 0.54). Stage 1 prompt may  │
│  not emphasize temporal focus."                         │
│  Affected: 34 queries | Suggested fix: [View]          │
├─────────────────────────────────────────────────────────┤
│ ⚠️ MEDIUM IMPACT                                        │
│ "Technical queries score 15% lower on Completeness     │
│  than general queries. May need domain-specific        │
│  source selection."                                     │
│  Affected: 18 queries | Suggested fix: [View]          │
└─────────────────────────────────────────────────────────┘
```

### 4. Prompt Lab View

- List all prompts (Stage 1, 2, 3, evaluator prompts)
- Version history with diffs
- Side-by-side comparison: Prompt A vs Prompt B metrics
- A/B test configuration

---

## API Endpoints

### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/evaluation/sessions` | List sessions with evaluation scores |
| GET | `/api/evaluation/sessions/:logId` | Full evaluation trace for session |
| GET | `/api/evaluation/metrics` | Aggregate metrics with filters |
| GET | `/api/evaluation/patterns` | AI-detected patterns and suggestions |
| GET | `/api/prompts` | List all prompts with versions |
| PUT | `/api/prompts/:promptId` | Update prompt (creates new version) |
| POST | `/api/evaluation/analyze` | Trigger offline analysis on-demand |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/research/query` | Response includes `evaluation` field with scores |
| `GET /api/logs/sessions/:logId` | Response includes evaluation data |

### Response Extension

```json
{
  "logId": "uuid",
  "answer": "...",
  "sources": [...],
  "metadata": {...},
  "evaluation": {
    "planScore": 0.85,
    "retrievalScore": 0.78,
    "answerScore": 0.82,
    "overallScore": 0.82,
    "iterations": 2,
    "evaluationSkipped": false,
    "details": "GET /api/evaluation/sessions/:logId for full trace"
  }
}
```

---

## Module Structure

```
src/
├── evaluation/
│   ├── evaluation.module.ts
│   ├── evaluation.controller.ts
│   ├── services/
│   │   ├── evaluation.service.ts           # Main orchestrator
│   │   ├── plan-evaluator.service.ts       # Plan evaluation logic
│   │   ├── retrieval-evaluator.service.ts  # Retrieval evaluation
│   │   ├── answer-evaluator.service.ts     # Answer evaluation
│   │   ├── panel-evaluator.service.ts      # Multi-model panel
│   │   ├── score-aggregator.service.ts     # Confidence-weighted aggregation
│   │   ├── escalation-handler.service.ts   # Large model escalation
│   │   ├── iteration-controller.service.ts # Iteration logic
│   │   └── offline-analyzer.service.ts     # Offline analysis
│   ├── interfaces/
│   │   ├── evaluation-result.interface.ts
│   │   ├── evaluator-config.interface.ts
│   │   ├── dimension-scores.interface.ts
│   │   └── iteration-decision.interface.ts
│   ├── dto/
│   │   ├── evaluation-metrics.dto.ts
│   │   └── pattern-result.dto.ts
│   └── prompts/
│       ├── intent-analyst.prompt.ts
│       ├── coverage-checker.prompt.ts
│       ├── faithfulness-judge.prompt.ts
│       ├── quality-assessor.prompt.ts
│       ├── fact-checker.prompt.ts
│       └── escalation-reviewer.prompt.ts
```

---

## Implementation Phases

### Phase 1: Foundation (Core Infrastructure)
- [ ] Create evaluation module structure
- [ ] Implement EvaluationService with fail-safe wrapper
- [ ] Add evaluation configuration to app config
- [ ] Create evaluation data persistence layer
- [ ] Add evaluation fields to research response

### Phase 2: Plan Evaluation
- [ ] Implement PlanEvaluatorService
- [ ] Create evaluator prompts (intent, coverage, scope)
- [ ] Implement PanelEvaluatorService (parallel execution)
- [ ] Implement ScoreAggregatorService (confidence weighting)
- [ ] Implement IterationControllerService
- [ ] Integrate with Stage 1 pipeline

### Phase 3: Retrieval & Answer Evaluation
- [ ] Implement RetrievalEvaluatorService
- [ ] Implement AnswerEvaluatorService
- [ ] Add faithfulness and fact-checking prompts
- [ ] Integrate with Stage 2 and 3 pipeline
- [ ] Add answer regeneration logic

### Phase 4: Escalation
- [ ] Implement EscalationHandlerService
- [ ] Create meta-evaluation prompt for large model
- [ ] Add escalation trigger detection
- [ ] Integrate with panel evaluation flow

### Phase 5: Runtime UI
- [ ] Add evaluation scores to Agent Activity View
- [ ] Create iteration log component
- [ ] Add progressive disclosure toggle
- [ ] Create warning/notification components
- [ ] Add "evaluation skipped" indicator

### Phase 6: Offline Dashboard
- [ ] Create /evaluation route
- [ ] Implement Aggregate Metrics view
- [ ] Implement Query Explorer view
- [ ] Implement Pattern Detector view
- [ ] Implement Prompt Lab view
- [ ] Add offline analysis API endpoints

### Phase 7: Polish & Optimization
- [ ] Performance optimization (parallel evaluation)
- [ ] Add comprehensive error handling
- [ ] Create evaluation configuration UI
- [ ] Documentation and testing

---

## Success Criteria

- Plan evaluation catches > 80% of intent misalignment issues
- Average iteration count < 2 for passing queries
- Evaluation adds < 30 seconds to average query time
- System continues functioning when evaluation fails
- Offline analysis identifies actionable improvement patterns
- All evaluation data persisted and queryable

---

## Future Enhancements

- **A/B testing**: Automated prompt comparison with statistical significance
- **Auto-tuning**: Automatic threshold adjustment based on user feedback
- **Custom evaluators**: User-defined evaluation dimensions
- **Evaluation caching**: Skip re-evaluation for similar queries
- **Cross-query learning**: Use evaluation patterns to improve in real-time
