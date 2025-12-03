# Sprint 3-4 Implementation Plan: Core Agentic Behavior

**Document Version**: 1.0
**Created**: 2025-12-03
**Sprint Duration**: 2-3 weeks
**Expected Completion**: 2025-12-20

---

## Executive Summary

### Sprint Goals

Transform the Research Agent's synthesis and retrieval capabilities with self-correction loops, iterative refinement, and intelligent query decomposition. This sprint builds on the foundation established in Sprint 1-2 (ReAct Reasoning, Confidence Scoring, Working Memory) to create a truly agentic system that can critique its own work and fill knowledge gaps autonomously.

### Expected Impact

| Metric | Current (Sprint 1-2) | Target (Sprint 3-4) | Improvement |
|--------|---------------------|---------------------|-------------|
| Answer completeness | ~75% | > 90% | +15% |
| Reflection improvement | N/A | +15% per iteration | - |
| Hallucination rate | Unknown | < 10% | - |
| Source attribution | ~70% | > 95% | +25% |
| Query understanding | ~80% | > 95% | +15% |
| Gap detection accuracy | N/A | > 85% | - |

**Research Basis**:
- Reflexion Framework: 18-22% accuracy improvement on decision-making tasks
- Iterative RAG: 15-20% improvement in answer completeness
- Query Decomposition: 25% better performance on complex multi-part queries

### Phases Covered

1. **Phase 6.2**: Reflexion Loop - Self-critique after answer generation
2. **Phase 6.3**: Iterative Refinement - Multi-pass synthesis with feedback
3. **Phase 10.1**: Query Decomposition - Break complex queries into atomic sub-queries
4. **Phase 10.2**: Iterative Retrieval - Gap-filling retrieval cycles

---

## Architecture Overview

### System Context

The Sprint 3-4 enhancements integrate with the existing agentic foundation:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Research Agent Architecture                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────┐      ┌─────────────────────────────────────┐   │
│  │  Query Input   │─────▶│   QueryDecomposerService (NEW)      │   │
│  └────────────────┘      │   - Break complex into sub-queries  │   │
│                          │   - Dependency tracking             │   │
│                          └──────────────┬──────────────────────┘   │
│                                         │                           │
│                                         ▼                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │            OrchestratorService (Enhanced)                    │   │
│  │  - Iterative retrieval loop                                 │   │
│  │  - Coverage analysis                                        │   │
│  │  - Multi-pass synthesis orchestration                      │   │
│  └──────────────┬──────────────────────────────────────────────┘   │
│                 │                                                   │
│         ┌───────┴────────┐                                         │
│         ▼                ▼                                         │
│  ┌──────────────┐  ┌──────────────────┐                           │
│  │ Search Phase │  │ Synthesis Phase  │◄──────┐                    │
│  │  Executor    │  │   Executor       │       │                    │
│  └──────┬───────┘  └────────┬─────────┘       │                    │
│         │                   │                  │ Feedback Loop      │
│         ▼                   ▼                  │                    │
│  ┌───────────────────────────────────────┐    │                    │
│  │  CoverageAnalyzerService (NEW)        │    │                    │
│  │  - Detect answered vs unanswered      │    │                    │
│  │  - Identify missing information       │────┘                    │
│  └───────────────┬───────────────────────┘                         │
│                  │                                                  │
│                  ▼                                                  │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │         ReflectionService (NEW)                           │     │
│  │  ┌────────────────┐  ┌─────────────────┐                │     │
│  │  │  GapDetector   │  │ SelfCritiqueEngine│              │     │
│  │  │  - Weak claims │  │ - LLM-based      │               │     │
│  │  │  - Missing info│  │ - Structured     │               │     │
│  │  └────────┬───────┘  └─────────┬───────┘                │     │
│  │           │                     │                         │     │
│  │           └──────────┬──────────┘                         │     │
│  │                      ▼                                     │     │
│  │           ┌──────────────────────┐                        │     │
│  │           │  RefinementEngine    │                        │     │
│  │           │  - Incorporate       │                        │     │
│  │           │    feedback          │                        │     │
│  │           │  - Multi-pass        │                        │     │
│  │           │    synthesis         │                        │     │
│  │           └──────────────────────┘                        │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │     Existing Sprint 1-2 Services (Foundation)             │     │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐ │     │
│  │  │ ReasoningTrace   │  │ ConfidenceScoringService     │ │     │
│  │  │   Service        │  │ - ClaimExtractor             │ │     │
│  │  │ - Thought events │  │ - EntailmentChecker          │ │     │
│  │  │ - Action logs    │  │ - SUScoreCalculator          │ │     │
│  │  │ - Observations   │  │ - ConfidenceAggregator       │ │     │
│  │  └──────────────────┘  └──────────────────────────────┘ │     │
│  │                                                          │     │
│  │  ┌──────────────────────────────────────────────────┐   │     │
│  │  │  WorkingMemoryService                            │   │     │
│  │  │  - Sub-goals, hypotheses                         │   │     │
│  │  │  - Gathered information                          │   │     │
│  │  │  - Identified gaps                               │   │     │
│  │  └──────────────────────────────────────────────────┘   │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Integration Points

| Existing Component | Sprint 3-4 Enhancement | Integration Method |
|-------------------|------------------------|-------------------|
| **SynthesisPhaseExecutor** | ReflectionService | Post-synthesis hook: `executeSynthesisWithReflection()` |
| **ConfidenceScoringService** | GapDetector | Use claim confidences to identify weak claims |
| **WorkingMemoryService** | All new services | Store gaps, sub-queries, refinement history |
| **ReasoningTraceService** | ReflectionService | Emit reflection thoughts/observations |
| **OrchestratorService** | QueryDecomposer, CoverageAnalyzer | Pre-planning decomposition, iterative loop control |
| **EventCoordinatorService** | All new services | SSE events for UI real-time updates |

### Key Design Decisions

1. **Reflection as Post-Synthesis Step**: Integrate reflection loop after initial synthesis, before final output
2. **Coverage-Driven Retrieval**: Use coverage analysis to determine when retrieval is "good enough"
3. **Memory-Backed State**: Leverage WorkingMemoryService to track refinement iterations and gap resolution
4. **Iterative Boundaries**: Max 3 reflection iterations, max 2 additional retrieval cycles (configurable)
5. **Quality Gates**: Each iteration must improve quality score by ≥5% or terminate early
6. **Event-Driven UI**: All major steps emit SSE events for transparent progress tracking

---

## Detailed Task Breakdown

### Phase 6.2: Reflexion Loop Implementation

#### Task 6.2.1: Create ReflectionService Core
**Priority**: P0 (Critical)
**Effort**: 8 hours
**Dependencies**: None (uses existing services)

**Files to Create**:
- `src/reflection/services/reflection.service.ts`
- `src/reflection/interfaces/reflection-result.interface.ts`
- `src/reflection/interfaces/reflection-config.interface.ts`
- `src/reflection/reflection.module.ts`

**Implementation Details**:
```typescript
interface ReflectionConfig {
  maxIterations: number;           // Default: 3
  minImprovementThreshold: number; // Default: 0.05 (5%)
  qualityTargetThreshold: number;  // Default: 0.9 (90%)
  timeoutPerIteration: number;     // Default: 30000ms
}

interface ReflectionResult {
  iterationCount: number;
  improvements: number[];           // Quality score per iteration
  identifiedGaps: Gap[];
  finalAnswer: string;
  finalConfidence: number;
  reflectionTrace: ReflectionStep[];
}

interface ReflectionStep {
  iteration: number;
  critique: string;
  gapsFound: Gap[];
  confidenceBefore: number;
  confidenceAfter: number;
  improvement: number;
}
```

**Acceptance Criteria**:
- [x] Service orchestrates full reflection loop
- [x] Integrates with ConfidenceScoringService to measure improvement
- [x] Emits SSE events: `reflection_started`, `reflection_iteration`, `reflection_completed`
- [x] Logs all reflection steps via ResearchLogger
- [x] Respects max iterations and early termination conditions
- [x] Unit tests: 90%+ coverage, mock all dependencies
- [x] Integration test: End-to-end reflection loop with mock LLM responses

---

#### Task 6.2.2: Implement GapDetectorService
**Priority**: P0 (Critical)
**Effort**: 6 hours
**Dependencies**: Task 6.2.1

**Files to Create**:
- `src/reflection/services/gap-detector.service.ts`
- `src/reflection/interfaces/gap.interface.ts`

**Implementation Details**:
```typescript
interface Gap {
  id: string;
  type: 'missing_info' | 'weak_claim' | 'contradiction' | 'incomplete_coverage';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  suggestedAction: string;
  relatedClaim?: Claim;
  confidence: number;  // How certain we are this is a gap
}

class GapDetectorService {
  async detectGaps(
    answer: string,
    sources: Source[],
    claims: Claim[],
    claimConfidences: ClaimConfidence[],
    query: string,
    logId?: string
  ): Promise<Gap[]>;
}
```

**Gap Detection Algorithm**:
1. **Weak Claims Detection**: Claims with confidence < 0.5 → major gap
2. **Missing Information**: LLM prompt to identify unanswered query aspects
3. **Source Coverage**: Claims without supporting sources → critical gap
4. **Contradictions**: Claims contradicted by sources → critical gap
5. **Query Coverage**: Compare query sub-topics vs. answer coverage

**LLM Prompt for Missing Information**:
```
Query: "{query}"
Answer: "{answer}"
Sources: [list of source titles/URLs]

Analyze whether this answer fully addresses the query. Identify:
1. What specific aspects of the query are not addressed?
2. What additional context would make the answer more complete?
3. What important nuances or details are missing?
4. Are there contradictions or ambiguities that need clarification?

For each gap, specify:
- Description (1-2 sentences)
- Severity: critical/major/minor
- Suggested action to resolve the gap

Output JSON array of gaps.
```

**Acceptance Criteria**:
- [x] Detects all 5 gap types with appropriate severity
- [x] Returns actionable suggestions for gap resolution
- [x] Integrates with existing ConfidenceScoringService outputs
- [x] Emits SSE events: `gap_detection_started`, `gap_detected`, `gap_detection_completed`
- [x] Unit tests: 85%+ coverage with mock confidence scores
- [x] Integration test: Real LLM-based gap detection with example answers

---

#### Task 6.2.3: Implement SelfCritiqueEngine
**Priority**: P0 (Critical)
**Effort**: 6 hours
**Dependencies**: Task 6.2.1, 6.2.2

**Files to Create**:
- `src/reflection/services/self-critique-engine.service.ts`
- `src/reflection/prompts/self-critique.prompt.ts`

**Implementation Details**:
```typescript
interface SelfCritique {
  overallAssessment: string;
  strengths: string[];
  weaknesses: string[];
  suggestedImprovements: string[];
  criticalIssues: string[];
  confidence: number;  // Confidence in the critique itself
}

class SelfCritiqueEngineService {
  async critiqueSynthesis(
    answer: string,
    sources: Source[],
    query: string,
    confidenceResult: ConfidenceResult,
    gaps: Gap[],
    logId?: string
  ): Promise<SelfCritique>;
}
```

**Self-Critique Prompt Structure**:
```
You are a critical evaluator of research answers. Analyze this answer objectively.

Query: "{query}"
Answer: "{answer}"
Sources: [list with titles/URLs]
Detected Gaps: [list of gaps with severity]
Confidence Scores: [claim-level confidences]

Provide a structured critique:

1. STRENGTHS (what is done well):
   - List 2-4 specific strengths

2. WEAKNESSES (what needs improvement):
   - List 2-4 specific weaknesses with evidence

3. CRITICAL ISSUES (must be fixed):
   - List any factual errors, missing key information, or contradictions

4. SUGGESTED IMPROVEMENTS (actionable next steps):
   - Specific, prioritized improvements to make

5. OVERALL ASSESSMENT (1-2 sentences):
   - Summary judgment of answer quality

Be specific, cite sources, and prioritize critical issues.
```

**Acceptance Criteria**:
- [x] Generates structured critique with all 5 sections
- [x] Identifies strengths AND weaknesses (balanced critique)
- [x] Provides actionable improvement suggestions
- [x] Integrates with GapDetector results
- [x] Emits SSE events: `self_critique_started`, `self_critique_completed`
- [x] Unit tests: 85%+ coverage with mock LLM responses
- [x] Integration test: Real LLM critique with known good/bad answers

---

#### Task 6.2.4: Integrate ReflectionService into SynthesisPhaseExecutor
**Priority**: P0 (Critical)
**Effort**: 4 hours
**Dependencies**: Task 6.2.1, 6.2.2, 6.2.3

**Files to Modify**:
- `src/orchestration/phase-executors/synthesis-phase-executor.ts`
- `src/orchestration/orchestrator.service.ts`

**Implementation Details**:
```typescript
// In SynthesisPhaseExecutor
async execute(phase: Phase, context: PhaseExecutionContext): Promise<PhaseResult> {
  // Execute normal synthesis
  const initialResult = await super.execute(phase, context);

  if (initialResult.status !== 'completed') {
    return initialResult;
  }

  // Check if reflection is enabled for this phase
  if (!this.shouldEnableReflection(phase)) {
    return initialResult;
  }

  // Run reflection loop
  const reflectionResult = await this.reflectionService.reflect(
    this.extractAnswerText(initialResult.stepResults),
    this.extractSources(context.allPreviousResults),
    context.query,
    context.logId
  );

  // Update result with refined answer
  return this.mergeReflectionResult(initialResult, reflectionResult);
}
```

**Configuration**:
- Add reflection config to environment variables:
  ```bash
  REFLECTION_ENABLED=true
  REFLECTION_MAX_ITERATIONS=3
  REFLECTION_MIN_IMPROVEMENT=0.05
  REFLECTION_QUALITY_TARGET=0.9
  ```

**Acceptance Criteria**:
- [x] Reflection runs automatically after synthesis completion
- [x] Original answer preserved if reflection fails
- [x] Reflection results stored in WorkingMemoryService
- [x] SSE events emit reflection progress to UI
- [x] Unit tests: 90%+ coverage with mock ReflectionService
- [x] Integration test: Full synthesis → reflection → refined answer pipeline

---

### Phase 6.3: Iterative Refinement Implementation

#### Task 6.3.1: Create RefinementEngineService
**Priority**: P0 (Critical)
**Effort**: 8 hours
**Dependencies**: Task 6.2.1, 6.2.3

**Files to Create**:
- `src/reflection/services/refinement-engine.service.ts`
- `src/reflection/interfaces/refinement-result.interface.ts`

**Implementation Details**:
```typescript
interface RefinementContext {
  originalAnswer: string;
  critique: SelfCritique;
  gaps: Gap[];
  sources: Source[];
  iteration: number;
  previousAttempts: RefinementAttempt[];
}

interface RefinementAttempt {
  iteration: number;
  refinedAnswer: string;
  improvement: number;
  addressedGaps: string[];
  remainingGaps: string[];
}

interface RefinementResult {
  finalAnswer: string;
  refinementHistory: RefinementAttempt[];
  totalImprovement: number;
  gapsResolved: number;
  gapsRemaining: number;
}

class RefinementEngineService {
  async refineAnswer(
    context: RefinementContext,
    logId?: string
  ): Promise<string>;

  async executeRefinementLoop(
    initialAnswer: string,
    sources: Source[],
    query: string,
    logId?: string
  ): Promise<RefinementResult>;
}
```

**Refinement Prompt Structure**:
```
You are refining a research answer based on critical feedback.

ORIGINAL QUERY: "{query}"
ORIGINAL ANSWER: "{originalAnswer}"

CRITIQUE:
Strengths: {strengths}
Weaknesses: {weaknesses}
Critical Issues: {criticalIssues}
Suggested Improvements: {suggestedImprovements}

IDENTIFIED GAPS:
{gaps with severity and suggested actions}

SOURCES AVAILABLE:
{source list with titles/URLs}

TASK:
Generate an improved answer that addresses the critique and fills the gaps.

REQUIREMENTS:
1. Address all critical issues first
2. Incorporate suggested improvements
3. Fill identified gaps using available sources
4. Maintain strengths from the original answer
5. Add proper source citations
6. Keep the same structure and tone

REFINED ANSWER:
```

**Multi-Pass Strategy**:
1. **Pass 1**: Address critical issues and major gaps
2. **Pass 2**: Incorporate all suggested improvements
3. **Pass 3**: Polish, verify citations, final quality check

**Acceptance Criteria**:
- [x] Executes up to 3 refinement passes
- [x] Each pass improves quality score by ≥5% or terminates
- [x] Tracks which gaps were addressed in each iteration
- [x] Preserves good aspects of original answer
- [x] Emits SSE events: `refinement_started`, `refinement_pass`, `refinement_completed`
- [x] Unit tests: 85%+ coverage with mock critiques
- [x] Integration test: Real multi-pass refinement with known improvable answer

---

#### Task 6.3.2: Implement Iterative Refinement Orchestration
**Priority**: P0 (Critical)
**Effort**: 6 hours
**Dependencies**: Task 6.3.1, 6.2.4

**Files to Modify**:
- `src/reflection/services/reflection.service.ts`
- `src/orchestration/orchestrator.service.ts`

**Implementation Details**:
```typescript
// In ReflectionService
async reflect(
  answer: string,
  sources: Source[],
  query: string,
  logId?: string
): Promise<ReflectionResult> {
  const reflectionTrace: ReflectionStep[] = [];
  let currentAnswer = answer;
  let iteration = 0;

  const initialConfidence = await this.getConfidenceScore(currentAnswer, sources, logId);
  let previousConfidence = initialConfidence;

  while (iteration < this.config.maxIterations) {
    iteration++;

    // Step 1: Detect gaps
    const gaps = await this.gapDetector.detectGaps(
      currentAnswer, sources, /* other params */, logId
    );

    // Step 2: Generate critique
    const critique = await this.selfCritiqueEngine.critiqueSynthesis(
      currentAnswer, sources, query, /* confidence */, gaps, logId
    );

    // Step 3: Refine answer
    const refinedAnswer = await this.refinementEngine.refineAnswer({
      originalAnswer: currentAnswer,
      critique, gaps, sources, iteration,
      previousAttempts: reflectionTrace.map(s => ({ /* ... */ }))
    }, logId);

    // Step 4: Measure improvement
    const newConfidence = await this.getConfidenceScore(refinedAnswer, sources, logId);
    const improvement = newConfidence - previousConfidence;

    // Step 5: Record iteration
    reflectionTrace.push({
      iteration, critique: critique.overallAssessment,
      gapsFound: gaps, confidenceBefore: previousConfidence,
      confidenceAfter: newConfidence, improvement
    });

    // Step 6: Check termination conditions
    if (improvement < this.config.minImprovementThreshold) {
      this.logger.log(`Iteration ${iteration}: Diminishing returns (${improvement.toFixed(3)}), terminating`);
      break;
    }

    if (newConfidence >= this.config.qualityTargetThreshold) {
      this.logger.log(`Iteration ${iteration}: Quality target reached (${newConfidence.toFixed(3)}), terminating`);
      break;
    }

    currentAnswer = refinedAnswer;
    previousConfidence = newConfidence;
  }

  return {
    iterationCount: iteration,
    improvements: reflectionTrace.map(s => s.improvement),
    identifiedGaps: reflectionTrace.flatMap(s => s.gapsFound),
    finalAnswer: currentAnswer,
    finalConfidence: previousConfidence,
    reflectionTrace
  };
}
```

**Acceptance Criteria**:
- [x] Orchestrates full reflection loop with gap detection → critique → refinement
- [x] Terminates on: max iterations, quality target, or diminishing returns
- [x] Each iteration builds on previous refinements
- [x] Working memory updated with refinement history
- [x] Emits detailed SSE events for UI progress tracking
- [x] Unit tests: 90%+ coverage with mock services
- [x] Integration test: Full iterative refinement loop with 2-3 iterations

---

### Phase 10.1: Query Decomposition Implementation

#### Task 10.1.1: Create QueryDecomposerService
**Priority**: P0 (Critical)
**Effort**: 8 hours
**Dependencies**: None

**Files to Create**:
- `src/orchestration/services/query-decomposer.service.ts`
- `src/orchestration/interfaces/sub-query.interface.ts`
- `src/orchestration/interfaces/decomposition-result.interface.ts`

**Implementation Details**:
```typescript
interface SubQuery {
  id: string;
  text: string;
  order: number;                    // Execution order
  dependencies: string[];           // IDs of sub-queries this depends on
  type: 'factual' | 'analytical' | 'comparative' | 'temporal';
  priority: 'high' | 'medium' | 'low';
  estimatedComplexity: number;      // 1-5 scale
}

interface DecompositionResult {
  originalQuery: string;
  isComplex: boolean;              // Whether decomposition was needed
  subQueries: SubQuery[];
  executionPlan: SubQuery[][];     // Grouped by execution phase
  reasoning: string;               // Why this decomposition was chosen
}

class QueryDecomposerService {
  async decomposeQuery(
    query: string,
    logId?: string
  ): Promise<DecompositionResult>;

  private buildExecutionPlan(subQueries: SubQuery[]): SubQuery[][];
}
```

**Query Decomposition Prompt**:
```
Analyze this query and break it down into atomic sub-queries if needed.

QUERY: "{query}"

TASK:
1. Determine if the query is complex (multiple aspects, temporal range, comparisons)
2. If complex, break it into 2-5 atomic sub-queries that:
   - Each focus on a single aspect
   - Can be answered independently (or with minimal dependencies)
   - Together fully cover the original query
3. Identify dependencies between sub-queries
4. Assign priority and complexity to each

OUTPUT FORMAT (JSON):
{
  "isComplex": true/false,
  "reasoning": "Why this decomposition was chosen",
  "subQueries": [
    {
      "text": "Sub-query text",
      "order": 1,
      "dependencies": [],  // IDs of dependent sub-queries
      "type": "factual|analytical|comparative|temporal",
      "priority": "high|medium|low",
      "estimatedComplexity": 1-5
    }
  ]
}

EXAMPLES:

Query: "What is quantum computing?"
→ Not complex, no decomposition needed

Query: "Compare the economic impacts of AI and blockchain between 2020-2024"
→ Complex, decompose into:
  1. "What are the economic impacts of AI from 2020-2024?" (factual, temporal)
  2. "What are the economic impacts of blockchain from 2020-2024?" (factual, temporal)
  3. "Compare findings from queries 1 and 2" (comparative, depends on 1,2)

Query: "What caused the 2008 financial crisis and how does it compare to the Great Depression?"
→ Complex, decompose into:
  1. "What caused the 2008 financial crisis?" (factual)
  2. "What caused the Great Depression?" (factual)
  3. "Compare the causes from queries 1 and 2" (comparative, depends on 1,2)
```

**Execution Plan Algorithm**:
```typescript
private buildExecutionPlan(subQueries: SubQuery[]): SubQuery[][] {
  const phases: SubQuery[][] = [];
  const completed = new Set<string>();
  const remaining = [...subQueries];

  while (remaining.length > 0) {
    // Find all sub-queries with satisfied dependencies
    const readyToExecute = remaining.filter(sq =>
      sq.dependencies.every(dep => completed.has(dep))
    );

    if (readyToExecute.length === 0) {
      throw new Error('Circular dependency detected in sub-queries');
    }

    // Add to current phase and mark completed
    phases.push(readyToExecute);
    readyToExecute.forEach(sq => {
      completed.add(sq.id);
      const index = remaining.indexOf(sq);
      remaining.splice(index, 1);
    });
  }

  return phases;
}
```

**Acceptance Criteria**:
- [x] Correctly identifies simple vs. complex queries
- [x] Decomposes complex queries into 2-5 atomic sub-queries
- [x] Tracks dependencies between sub-queries
- [x] Generates execution plan respecting dependencies
- [x] Detects circular dependencies and throws error
- [x] Emits SSE events: `decomposition_started`, `sub_query_identified`, `decomposition_completed`
- [x] Unit tests: 90%+ coverage with complex query examples
- [x] Integration test: Real LLM decomposition with known complex queries

---

#### Task 10.1.2: Integrate Query Decomposition into Orchestrator
**Priority**: P0 (Critical)
**Effort**: 6 hours
**Dependencies**: Task 10.1.1

**Files to Modify**:
- `src/orchestration/orchestrator.service.ts`
- `src/orchestration/planner.service.ts`

**Implementation Details**:
```typescript
// In OrchestratorService
async orchestrateResearch(query: string, logId: string): Promise<ResearchResult> {
  // Step 1: Decompose query
  const decomposition = await this.queryDecomposer.decomposeQuery(query, logId);

  if (!decomposition.isComplex) {
    // Simple query - execute normal flow
    return this.executeSimpleQuery(query, logId);
  }

  // Complex query - execute sub-queries according to plan
  return this.executeDecomposedQuery(decomposition, logId);
}

async executeDecomposedQuery(
  decomposition: DecompositionResult,
  logId: string
): Promise<ResearchResult> {
  const subQueryResults = new Map<string, any>();

  // Execute each phase of sub-queries
  for (const phase of decomposition.executionPlan) {
    await Promise.all(
      phase.map(async (subQuery) => {
        // Gather dependency results
        const dependencyResults = subQuery.dependencies.map(depId =>
          subQueryResults.get(depId)
        );

        // Execute sub-query with dependency context
        const result = await this.executeSubQuery(
          subQuery,
          dependencyResults,
          logId
        );

        subQueryResults.set(subQuery.id, result);
      })
    );
  }

  // Synthesize final answer from all sub-query results
  return this.synthesizeFinalAnswer(
    decomposition.originalQuery,
    subQueryResults,
    logId
  );
}
```

**Working Memory Integration**:
- Store decomposition result in working memory
- Track sub-query execution status
- Link sub-query results to parent query

**Acceptance Criteria**:
- [x] Automatically decomposes complex queries before planning
- [x] Executes sub-queries in correct order respecting dependencies
- [x] Parallel execution of independent sub-queries in same phase
- [x] Synthesizes final answer from all sub-query results
- [x] Working memory tracks sub-query execution state
- [x] SSE events show sub-query progress in UI
- [x] Unit tests: 85%+ coverage with mock decomposition
- [x] Integration test: End-to-end complex query with 3 sub-queries

---

### Phase 10.2: Iterative Retrieval Implementation

#### Task 10.2.1: Create CoverageAnalyzerService
**Priority**: P0 (Critical)
**Effort**: 8 hours
**Dependencies**: Task 10.1.1

**Files to Create**:
- `src/orchestration/services/coverage-analyzer.service.ts`
- `src/orchestration/interfaces/coverage-result.interface.ts`
- `src/orchestration/interfaces/query-aspect.interface.ts`

**Implementation Details**:
```typescript
interface QueryAspect {
  id: string;
  description: string;
  keywords: string[];
  answered: boolean;
  confidence: number;           // How well it's answered (0-1)
  supportingSources: string[];  // Source IDs
}

interface CoverageResult {
  overallCoverage: number;      // 0-1, percentage of query aspects covered
  aspectsCovered: QueryAspect[];
  aspectsMissing: QueryAspect[];
  suggestedRetrievals: SuggestedRetrieval[];
  isComplete: boolean;          // Whether coverage threshold met
}

interface SuggestedRetrieval {
  aspect: string;
  searchQuery: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
}

class CoverageAnalyzerService {
  async analyzeCoverage(
    query: string,
    currentAnswer: string,
    sources: Source[],
    subQueries?: SubQuery[],
    logId?: string
  ): Promise<CoverageResult>;

  async suggestAdditionalRetrieval(
    missingAspects: QueryAspect[],
    logId?: string
  ): Promise<SuggestedRetrieval[]>;
}
```

**Coverage Analysis Prompt**:
```
Analyze whether the current answer adequately covers all aspects of the query.

ORIGINAL QUERY: "{query}"
SUB-QUERIES (if decomposed): [list]
CURRENT ANSWER: "{currentAnswer}"
SOURCES USED: [list of source titles/URLs]

TASK:
1. Identify all distinct aspects/questions implied by the query
2. For each aspect, determine:
   - Is it addressed in the answer? (yes/no)
   - How well is it addressed? (confidence 0-1)
   - Which sources support this aspect?
3. Identify missing or poorly covered aspects
4. Suggest additional searches to fill gaps

OUTPUT FORMAT (JSON):
{
  "aspects": [
    {
      "description": "Aspect description",
      "keywords": ["key", "terms"],
      "answered": true/false,
      "confidence": 0.0-1.0,
      "supportingSources": ["source1", "source2"]
    }
  ],
  "suggestedRetrievals": [
    {
      "aspect": "Missing aspect description",
      "searchQuery": "Specific search query to fill gap",
      "priority": "high|medium|low",
      "reasoning": "Why this retrieval is needed"
    }
  ]
}

COVERAGE THRESHOLD: 0.85 (85% of aspects covered with confidence ≥0.7)
```

**Coverage Calculation**:
```typescript
private calculateOverallCoverage(aspects: QueryAspect[]): number {
  if (aspects.length === 0) return 1.0;

  const weightedSum = aspects.reduce((sum, aspect) => {
    // Answered aspects contribute their confidence
    // Unanswered aspects contribute 0
    return sum + (aspect.answered ? aspect.confidence : 0);
  }, 0);

  return weightedSum / aspects.length;
}
```

**Acceptance Criteria**:
- [x] Identifies all distinct aspects of the query
- [x] Accurately determines answered vs. unanswered aspects
- [x] Calculates overall coverage score (0-1)
- [x] Suggests targeted retrieval queries for gaps
- [x] Respects coverage threshold (default 0.85)
- [x] Emits SSE events: `coverage_analysis_started`, `coverage_analysis_completed`
- [x] Unit tests: 85%+ coverage with known query/answer pairs
- [x] Integration test: Real LLM coverage analysis with partial answers

---

#### Task 10.2.2: Implement Iterative Retrieval Loop
**Priority**: P0 (Critical)
**Effort**: 8 hours
**Dependencies**: Task 10.2.1, Task 10.1.2

**Files to Modify**:
- `src/orchestration/orchestrator.service.ts`
- `src/orchestration/phase-executors/search-phase-executor.ts`

**Implementation Details**:
```typescript
// In OrchestratorService
async executeWithIterativeRetrieval(
  query: string,
  logId: string,
  maxRetrievalCycles: number = 2
): Promise<ResearchResult> {
  let currentSources: Source[] = [];
  let currentAnswer = '';
  let cycle = 0;

  while (cycle < maxRetrievalCycles) {
    cycle++;

    // Retrieval phase
    const newSources = await this.executeRetrievalPhase(
      query,
      currentAnswer,
      cycle,
      logId
    );
    currentSources = [...currentSources, ...newSources];

    // Synthesis phase
    currentAnswer = await this.executeSynthesisPhase(
      query,
      currentSources,
      logId
    );

    // Coverage analysis
    const coverage = await this.coverageAnalyzer.analyzeCoverage(
      query,
      currentAnswer,
      currentSources,
      undefined, // subQueries
      logId
    );

    // Store coverage in working memory
    this.workingMemory.setScratchPadValue(logId, `coverage_cycle_${cycle}`, coverage);

    // Check termination conditions
    if (coverage.isComplete) {
      this.logger.log(`Cycle ${cycle}: Coverage threshold met (${coverage.overallCoverage.toFixed(2)}), terminating`);
      break;
    }

    if (coverage.suggestedRetrievals.length === 0) {
      this.logger.log(`Cycle ${cycle}: No additional retrieval suggestions, terminating`);
      break;
    }

    if (cycle === maxRetrievalCycles) {
      this.logger.log(`Cycle ${cycle}: Max cycles reached, terminating`);
      break;
    }

    // Prepare for next cycle with suggested retrievals
    this.logger.log(`Cycle ${cycle}: Coverage ${coverage.overallCoverage.toFixed(2)}, continuing with ${coverage.suggestedRetrievals.length} additional retrievals`);
  }

  return {
    answer: currentAnswer,
    sources: currentSources,
    metadata: {
      retrievalCycles: cycle,
      finalCoverage: await this.getFinalCoverage(logId)
    }
  };
}
```

**Gap-Filling Retrieval Strategy**:
```typescript
async executeRetrievalPhase(
  query: string,
  previousAnswer: string,
  cycle: number,
  logId: string
): Promise<Source[]> {
  if (cycle === 1) {
    // First cycle: normal search based on query
    return this.searchPhaseExecutor.search(query, logId);
  }

  // Subsequent cycles: targeted gap-filling searches
  const coverage = this.workingMemory.getScratchPadValue<CoverageResult>(
    logId,
    `coverage_cycle_${cycle - 1}`
  );

  if (!coverage || coverage.suggestedRetrievals.length === 0) {
    return [];
  }

  // Execute suggested retrieval queries
  const gapFillingSources = await Promise.all(
    coverage.suggestedRetrievals.map(suggestion =>
      this.searchPhaseExecutor.search(suggestion.searchQuery, logId)
    )
  );

  return gapFillingSources.flat();
}
```

**Acceptance Criteria**:
- [x] Executes up to 2 additional retrieval cycles (configurable)
- [x] Each cycle performs coverage analysis
- [x] Terminates when coverage threshold met (0.85 default)
- [x] Terminates if no more retrieval suggestions
- [x] Gap-filling searches target missing aspects
- [x] Working memory tracks all cycles and coverage
- [x] SSE events emit cycle progress: `retrieval_cycle_started`, `coverage_checked`, `retrieval_cycle_completed`
- [x] Unit tests: 85%+ coverage with mock coverage results
- [x] Integration test: Full iterative retrieval with 2 cycles

---

### Phase 10.2.3: Integration and End-to-End Flow

#### Task 10.2.3: Implement Full Agentic Research Pipeline
**Priority**: P0 (Critical)
**Effort**: 6 hours
**Dependencies**: All previous tasks

**Files to Modify**:
- `src/orchestration/orchestrator.service.ts`
- `src/research/research.service.ts`

**Implementation Details**:
```typescript
// In OrchestratorService - Full Agentic Flow
async orchestrateAgenticResearch(
  query: string,
  logId: string
): Promise<AgenticResearchResult> {
  // Phase 1: Query Decomposition
  const decomposition = await this.queryDecomposer.decomposeQuery(query, logId);
  this.workingMemory.setScratchPadValue(logId, 'decomposition', decomposition);

  let finalResult: ResearchResult;

  if (decomposition.isComplex) {
    // Complex query path
    finalResult = await this.executeDecomposedQueryWithIterativeRetrieval(
      decomposition,
      logId
    );
  } else {
    // Simple query path
    finalResult = await this.executeSimpleQueryWithIterativeRetrieval(
      query,
      logId
    );
  }

  // Final reflection and refinement
  const reflectionResult = await this.reflectionService.reflect(
    finalResult.answer,
    finalResult.sources,
    query,
    logId
  );

  return {
    answer: reflectionResult.finalAnswer,
    sources: finalResult.sources,
    confidence: reflectionResult.finalConfidence,
    metadata: {
      decomposition,
      retrievalCycles: finalResult.metadata.retrievalCycles,
      reflectionIterations: reflectionResult.iterationCount,
      totalImprovement: reflectionResult.improvements.reduce((a, b) => a + b, 0),
      finalCoverage: finalResult.metadata.finalCoverage
    }
  };
}

async executeDecomposedQueryWithIterativeRetrieval(
  decomposition: DecompositionResult,
  logId: string
): Promise<ResearchResult> {
  const subQueryResults = new Map<string, SubQueryResult>();

  // Execute each phase with iterative retrieval
  for (const phase of decomposition.executionPlan) {
    await Promise.all(
      phase.map(async (subQuery) => {
        const result = await this.executeWithIterativeRetrieval(
          subQuery.text,
          logId,
          1 // Max 1 additional cycle for sub-queries
        );
        subQueryResults.set(subQuery.id, result);
      })
    );
  }

  // Synthesize final answer
  return this.synthesizeFinalAnswer(
    decomposition.originalQuery,
    subQueryResults,
    logId
  );
}
```

**Acceptance Criteria**:
- [x] Full pipeline: Decomposition → Iterative Retrieval → Synthesis → Reflection
- [x] Handles both simple and complex queries
- [x] Sub-queries use reduced retrieval cycles (1 vs. 2)
- [x] Working memory tracks entire execution
- [x] SSE events provide complete progress visibility
- [x] Proper error handling at each stage
- [x] Unit tests: 85%+ coverage for orchestration logic
- [x] Integration test: End-to-end complex query execution

---

## Testing Strategy

### Unit Testing

**Coverage Target**: 85%+ for all new services

**Test Structure**:
```typescript
describe('ReflectionService', () => {
  let service: ReflectionService;
  let mockGapDetector: jest.Mocked<GapDetectorService>;
  let mockSelfCritique: jest.Mocked<SelfCritiqueEngineService>;
  let mockRefinementEngine: jest.Mocked<RefinementEngineService>;
  let mockConfidenceScoring: jest.Mocked<ConfidenceScoringService>;

  beforeEach(async () => {
    // Setup mocks
    const module = await Test.createTestingModule({
      providers: [
        ReflectionService,
        { provide: GapDetectorService, useValue: mockGapDetector },
        { provide: SelfCritiqueEngineService, useValue: mockSelfCritique },
        { provide: RefinementEngineService, useValue: mockRefinementEngine },
        { provide: ConfidenceScoringService, useValue: mockConfidenceScoring }
      ]
    }).compile();

    service = module.get<ReflectionService>(ReflectionService);
  });

  describe('reflect()', () => {
    it('should execute full reflection loop with 2 iterations', async () => {
      // Test implementation
    });

    it('should terminate early on quality target reached', async () => {
      // Test implementation
    });

    it('should terminate on diminishing returns', async () => {
      // Test implementation
    });

    it('should handle max iterations limit', async () => {
      // Test implementation
    });
  });
});
```

**Key Test Scenarios**:
1. **Happy Path**: Normal execution with expected improvements
2. **Early Termination**: Quality target reached before max iterations
3. **Diminishing Returns**: Improvement below threshold triggers stop
4. **Error Handling**: Service failures gracefully handled
5. **Boundary Conditions**: Empty inputs, max limits, invalid data

### Integration Testing

**Coverage Target**: All critical flows tested end-to-end

**Test Scenarios**:

#### Scenario 1: Simple Query with Reflection
```typescript
describe('Simple Query E2E', () => {
  it('should execute query with reflection and iterative retrieval', async () => {
    const query = 'What is quantum computing?';
    const logId = 'test-log-id';

    const result = await orchestrator.orchestrateAgenticResearch(query, logId);

    expect(result.answer).toBeDefined();
    expect(result.metadata.decomposition.isComplex).toBe(false);
    expect(result.metadata.reflectionIterations).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.7);
  });
});
```

#### Scenario 2: Complex Query with Decomposition
```typescript
describe('Complex Query E2E', () => {
  it('should decompose and execute sub-queries with final synthesis', async () => {
    const query = 'Compare AI and blockchain economic impacts 2020-2024';
    const logId = 'test-log-id';

    const result = await orchestrator.orchestrateAgenticResearch(query, logId);

    expect(result.metadata.decomposition.isComplex).toBe(true);
    expect(result.metadata.decomposition.subQueries.length).toBeGreaterThan(1);
    expect(result.answer).toContain('AI');
    expect(result.answer).toContain('blockchain');
  });
});
```

#### Scenario 3: Iterative Retrieval with Coverage
```typescript
describe('Iterative Retrieval E2E', () => {
  it('should perform multiple retrieval cycles until coverage met', async () => {
    const query = 'What are the environmental impacts of cryptocurrency mining?';
    const logId = 'test-log-id';

    const result = await orchestrator.orchestrateAgenticResearch(query, logId);

    expect(result.metadata.retrievalCycles).toBeGreaterThan(1);
    expect(result.metadata.finalCoverage).toBeGreaterThan(0.85);
  });
});
```

#### Scenario 4: Reflection with Multiple Iterations
```typescript
describe('Reflection E2E', () => {
  it('should refine answer through multiple reflection iterations', async () => {
    const query = 'Explain the causes of World War I';
    const logId = 'test-log-id';

    const result = await orchestrator.orchestrateAgenticResearch(query, logId);

    expect(result.metadata.reflectionIterations).toBeGreaterThanOrEqual(2);
    expect(result.metadata.totalImprovement).toBeGreaterThan(0.1);
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
```

### End-to-End Testing

**Manual Test Cases**:

#### Test Case 1: Simple Factual Query
- **Query**: "What is the capital of France?"
- **Expected**: Single iteration, high confidence, no decomposition
- **Validation**: Answer contains "Paris", confidence > 0.9

#### Test Case 2: Complex Multi-Part Query
- **Query**: "Compare renewable energy adoption in Europe vs. Asia 2020-2024"
- **Expected**: Query decomposition (3 sub-queries), multiple retrieval cycles
- **Validation**: Answer addresses both regions, contains data for 2020-2024

#### Test Case 3: Gap-Filling Retrieval
- **Query**: "What are the health effects of vaping?"
- **Expected**: Initial retrieval + 1-2 additional cycles to cover different health aspects
- **Validation**: Coverage > 0.85, multiple retrieval cycles logged

#### Test Case 4: Reflection-Driven Refinement
- **Query**: "Explain quantum entanglement"
- **Expected**: Initial answer + 2-3 reflection iterations
- **Validation**: Final answer more comprehensive than initial, improvement > 10%

---

## Success Metrics

### Functional Metrics

| Metric | Measurement Method | Target | Critical Threshold |
|--------|-------------------|--------|-------------------|
| **Answer Completeness** | LLM evaluation of query coverage | > 90% | > 85% |
| **Reflection Improvement** | Confidence delta per iteration | +15% avg | +10% min |
| **Hallucination Rate** | Claim-source entailment check | < 10% | < 15% |
| **Source Attribution** | Citations per claim | > 95% | > 90% |
| **Query Decomposition Accuracy** | Manual review of sub-queries | > 90% | > 80% |
| **Coverage Detection Accuracy** | Compare to human annotation | > 85% | > 75% |
| **Gap Detection Recall** | True gaps identified / total gaps | > 80% | > 70% |
| **Gap Detection Precision** | True gaps / identified gaps | > 75% | > 65% |

### Performance Metrics

| Metric | Target | Maximum Acceptable |
|--------|--------|-------------------|
| Reflection iteration time | < 30s | < 45s |
| Query decomposition time | < 5s | < 10s |
| Coverage analysis time | < 8s | < 15s |
| Gap detection time | < 10s | < 20s |
| Full pipeline with reflection (simple query) | < 60s | < 90s |
| Full pipeline with decomposition (complex query) | < 120s | < 180s |

### Quality Metrics

| Metric | Measurement | Target |
|--------|-------------|--------|
| **Code Coverage** | Jest | > 85% |
| **Test Passing Rate** | CI/CD | 100% |
| **Type Safety** | TypeScript strict mode | 100% |
| **SSE Event Coverage** | Manual verification | 100% of major steps |
| **Error Handling** | Exception test coverage | > 90% |

### User Experience Metrics (UI)

| Metric | Target |
|--------|--------|
| Reflection progress visible in UI | Yes |
| Sub-query execution visible | Yes |
| Coverage analysis displayed | Yes |
| Gap detection shown | Yes |
| Refinement iterations shown | Yes |

---

## Implementation Order & Dependencies

### Week 1: Reflection Foundation (40 hours)

**Day 1-2 (16h)**: Phase 6.2.1-6.2.3
- Task 6.2.1: ReflectionService core (8h)
- Task 6.2.2: GapDetectorService (6h)
- Unit tests for both (2h)

**Day 3-4 (16h)**: Phase 6.2.3-6.2.4
- Task 6.2.3: SelfCritiqueEngine (6h)
- Task 6.2.4: Integration into SynthesisPhaseExecutor (4h)
- Integration tests (6h)

**Day 5 (8h)**: Phase 6.3.1
- Task 6.3.1: RefinementEngineService (6h)
- Unit tests (2h)

### Week 2: Iterative Refinement & Query Decomposition (40 hours)

**Day 1-2 (16h)**: Phase 6.3.2
- Task 6.3.2: Iterative refinement orchestration (6h)
- Integration tests (4h)
- End-to-end testing of reflection loop (6h)

**Day 3-4 (16h)**: Phase 10.1.1-10.1.2
- Task 10.1.1: QueryDecomposerService (8h)
- Task 10.1.2: Integration into orchestrator (6h)
- Unit tests (2h)

**Day 5 (8h)**: Phase 10.2.1
- Task 10.2.1: CoverageAnalyzerService (8h)

### Week 3: Iterative Retrieval & Integration (40 hours)

**Day 1-2 (16h)**: Phase 10.2.2
- Task 10.2.2: Iterative retrieval loop (8h)
- Unit tests (4h)
- Integration tests (4h)

**Day 3 (8h)**: Phase 10.2.3
- Task 10.2.3: Full agentic pipeline integration (6h)
- Unit tests (2h)

**Day 4-5 (16h)**: Testing & Documentation
- End-to-end testing of all flows (8h)
- Performance testing and optimization (4h)
- Documentation updates (4h)

### Critical Path

```
Start
  ↓
6.2.1 (ReflectionService) ← Foundation
  ↓
6.2.2 (GapDetector) + 6.2.3 (SelfCritique) ← Parallel
  ↓
6.2.4 (Integration) ← Critical
  ↓
6.3.1 (RefinementEngine)
  ↓
6.3.2 (Iterative Refinement) ← First Milestone
  ↓
10.1.1 (QueryDecomposer) ← Independent
  ↓
10.1.2 (Decomposition Integration)
  ↓
10.2.1 (CoverageAnalyzer)
  ↓
10.2.2 (Iterative Retrieval)
  ↓
10.2.3 (Full Integration) ← Final Milestone
  ↓
Testing & Documentation
  ↓
Sprint Complete
```

**Parallel Work Opportunities**:
- GapDetector (6.2.2) and SelfCritique (6.2.3) can be developed in parallel
- QueryDecomposer (10.1.1) can start while 6.3.2 is in testing
- Unit tests can be written alongside implementation

---

## Configuration & Environment

### New Environment Variables

Add to `.env`:
```bash
# Reflection Configuration
REFLECTION_ENABLED=true
REFLECTION_MAX_ITERATIONS=3
REFLECTION_MIN_IMPROVEMENT=0.05
REFLECTION_QUALITY_TARGET=0.9
REFLECTION_TIMEOUT_PER_ITERATION=30000

# Query Decomposition
DECOMPOSITION_ENABLED=true
DECOMPOSITION_MAX_SUB_QUERIES=5

# Iterative Retrieval
ITERATIVE_RETRIEVAL_ENABLED=true
ITERATIVE_RETRIEVAL_MAX_CYCLES=2
COVERAGE_THRESHOLD=0.85

# Performance Limits
MAX_REFLECTION_TIME=90000
MAX_DECOMPOSITION_TIME=10000
MAX_COVERAGE_ANALYSIS_TIME=15000
```

### Database Migrations

**Optional**: If storing reflection/coverage history for analytics:

```sql
-- Migration: Add reflection tracking table
CREATE TABLE reflection_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id VARCHAR(255) NOT NULL,
  iteration INT NOT NULL,
  confidence_before DECIMAL(5,4),
  confidence_after DECIMAL(5,4),
  improvement DECIMAL(5,4),
  gaps_found JSONB,
  critique TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_reflection_log_id ON reflection_history(log_id);

-- Migration: Add coverage tracking table
CREATE TABLE coverage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id VARCHAR(255) NOT NULL,
  cycle INT NOT NULL,
  overall_coverage DECIMAL(5,4),
  aspects_covered JSONB,
  aspects_missing JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_coverage_log_id ON coverage_history(log_id);
```

---

## Risk Assessment & Mitigation

### High-Risk Areas

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **LLM Hallucination in Critique** | High - Bad critique leads to bad refinement | Medium | Multiple critique validation, confidence scoring |
| **Infinite Reflection Loop** | High - Service hangs | Low | Strict iteration limits, timeout enforcement |
| **Query Decomposition Errors** | High - Wrong sub-queries | Medium | Decomposition validation, manual review option |
| **Coverage Analysis False Positives** | Medium - Unnecessary retrieval | Medium | Conservative thresholds, cost tracking |
| **Performance Degradation** | Medium - Slow queries | High | Timeouts, parallel execution, caching |
| **Circular Dependencies in Sub-Queries** | Low - Deadlock | Low | Dependency validation algorithm |

### Mitigation Strategies

1. **LLM Reliability**:
   - Use structured prompts with examples
   - Validate LLM outputs against expected format
   - Fallback to simpler prompts on parse errors
   - Log all LLM inputs/outputs for debugging

2. **Performance**:
   - Strict timeouts at each stage
   - Parallel execution where possible
   - Cache expensive operations (embeddings, decompositions)
   - Monitor execution time metrics

3. **Quality Assurance**:
   - Comprehensive unit tests with edge cases
   - Integration tests with real LLM
   - Manual review of complex query handling
   - A/B testing against baseline (Sprint 1-2)

---

## Rollout Strategy

### Phase 1: Feature Flag Rollout (Week 1)
- Deploy with all features **disabled** by default
- Enable reflection in staging environment
- Monitor performance and quality metrics
- Gradual rollout: 10% → 50% → 100%

### Phase 2: Progressive Enhancement (Week 2)
- Enable query decomposition for complex queries
- Enable iterative retrieval for high-priority queries
- Collect user feedback on UI transparency

### Phase 3: Full Production (Week 3)
- Enable all features by default
- Monitor for regressions
- Fine-tune thresholds based on real usage
- Document best practices

### Feature Flags

```typescript
interface AgenticConfig {
  enableReflection: boolean;
  enableDecomposition: boolean;
  enableIterativeRetrieval: boolean;
  reflectionMaxIterations: number;
  retrievalMaxCycles: number;
  coverageThreshold: number;
}
```

---

## Documentation Deliverables

### Developer Documentation
- [ ] Architecture diagram updated with new services
- [ ] API documentation for all new services
- [ ] Configuration guide for environment variables
- [ ] Integration guide for phase executors
- [ ] Testing guide with example tests

### User Documentation
- [ ] Feature announcement blog post
- [ ] UI updates guide (new reflection/coverage indicators)
- [ ] Performance expectations (longer query times)
- [ ] Troubleshooting guide

### Operational Documentation
- [ ] Monitoring dashboard setup
- [ ] Performance metrics tracking
- [ ] Error handling playbook
- [ ] Scaling considerations

---

## Post-Sprint Objectives

### Sprint Review
- Demo full agentic pipeline with complex query
- Present metrics: completeness, reflection improvement, coverage
- Review code quality and test coverage
- Discuss lessons learned

### Sprint Retrospective
- What worked well?
- What could be improved?
- Action items for Sprint 5-6

### Next Sprint Preview (Sprint 5-6)
- Phase 8.2: Fact-Checker Agent (adversarial verification)
- Phase 8.1: Specialist Agents (search, synthesis, citation agents)
- Phase 7.5: Confidence UI (visual indicators, claim-level tooltips)

---

## Appendix A: Prompt Templates

### Reflection Prompts

See Task 6.2.2 (Gap Detection Prompt), Task 6.2.3 (Self-Critique Prompt), Task 6.3.1 (Refinement Prompt) for full prompt structures.

### Query Decomposition Prompts

See Task 10.1.1 for full query decomposition prompt with examples.

### Coverage Analysis Prompts

See Task 10.2.1 for full coverage analysis prompt structure.

---

## Appendix B: Example Test Data

### Example Complex Queries
1. "Compare the economic impacts of AI and blockchain between 2020-2024"
2. "What caused the 2008 financial crisis and how does it compare to the Great Depression?"
3. "Explain the environmental, economic, and social impacts of cryptocurrency mining"
4. "How has climate change affected agriculture in Africa and South America from 2010-2023?"

### Example Gap Scenarios
1. **Missing Temporal Data**: Answer lacks recent 2024 information
2. **Incomplete Coverage**: Answer addresses AI but not blockchain in comparison
3. **Weak Claims**: Claim "AI improved productivity" without supporting data
4. **Contradictions**: Sources disagree on cryptocurrency energy usage

### Example Reflection Improvements
1. **Initial**: "AI has had economic impacts."
   **Refined**: "AI contributed to a 15% productivity increase in manufacturing (2020-2024), generating $2.3T in economic value according to McKinsey Global Institute."

2. **Initial**: "Cryptocurrency mining uses energy."
   **Refined**: "Bitcoin mining consumed an estimated 150 TWh annually in 2023, equivalent to Argentina's total electricity consumption, with 60% from renewable sources according to Cambridge Bitcoin Electricity Consumption Index."

---

## Appendix C: SSE Event Reference

### New SSE Events for Sprint 3-4

| Event Name | Payload | When Emitted |
|------------|---------|--------------|
| `reflection_started` | `{ logId, iteration: 0 }` | Beginning of reflection loop |
| `reflection_iteration` | `{ logId, iteration, gapsFound, confidence }` | Each reflection iteration |
| `reflection_completed` | `{ logId, iterations, totalImprovement, finalConfidence }` | End of reflection |
| `gap_detection_started` | `{ logId }` | Start of gap detection |
| `gap_detected` | `{ logId, gap: Gap }` | Each gap identified |
| `gap_detection_completed` | `{ logId, gapsCount, criticalGaps }` | End of gap detection |
| `self_critique_started` | `{ logId }` | Start of self-critique |
| `self_critique_completed` | `{ logId, critique: SelfCritique }` | End of self-critique |
| `refinement_started` | `{ logId, iteration }` | Start of refinement pass |
| `refinement_pass` | `{ logId, iteration, improvement }` | Each refinement iteration |
| `refinement_completed` | `{ logId, iterations, totalImprovement }` | End of refinement |
| `decomposition_started` | `{ logId, query }` | Start of query decomposition |
| `sub_query_identified` | `{ logId, subQuery: SubQuery }` | Each sub-query identified |
| `decomposition_completed` | `{ logId, isComplex, subQueryCount }` | End of decomposition |
| `coverage_analysis_started` | `{ logId, cycle }` | Start of coverage analysis |
| `coverage_analysis_completed` | `{ logId, coverage, suggestedRetrievals }` | End of coverage analysis |
| `retrieval_cycle_started` | `{ logId, cycle }` | Start of retrieval cycle |
| `coverage_checked` | `{ logId, cycle, coverage, isComplete }` | After coverage check |
| `retrieval_cycle_completed` | `{ logId, cycle, sourcesAdded }` | End of retrieval cycle |

---

## Appendix D: Quality Checklist

### Pre-Merge Checklist
- [ ] All unit tests passing (>85% coverage)
- [ ] All integration tests passing
- [ ] End-to-end tests with real LLM verified
- [ ] TypeScript strict mode enabled, no errors
- [ ] ESLint passing with no warnings
- [ ] All SSE events emitting correctly
- [ ] Working memory integration complete
- [ ] ResearchLogger integration complete
- [ ] Error handling implemented for all services
- [ ] Performance metrics within targets
- [ ] Documentation updated (API docs, README)
- [ ] Environment variables documented
- [ ] Configuration defaults sensible
- [ ] Feature flags implemented
- [ ] Code review completed
- [ ] Sprint goals met

### Post-Deployment Checklist
- [ ] Monitoring dashboards configured
- [ ] Alerts set up for errors and performance
- [ ] User documentation published
- [ ] Team training completed
- [ ] Rollback plan documented
- [ ] Success metrics tracked
- [ ] User feedback collected

---

**End of Implementation Plan**

This comprehensive plan provides everything needed to implement Sprint 3-4: Core Agentic Behavior. Follow the implementation order, respect dependencies, and validate against acceptance criteria. Good luck!
