# Brainstorm: Confidence Scoring Performance Optimization

**Date**: 2025-12-08
**Status**: Ready for Planning

## Executive Summary

The "Scoring answer confidence" step is slow due to sequential LLM calls (1 + N for N claims) using Azure Mistral. Through Socratic exploration, we identified that while accuracy is non-negotiable and concurrency cannot be increased, we can optimize by: (1) batching multiple claims into single LLM calls, (2) using the existing panel evaluator as a fast pre-filter, (3) extracting fewer, higher-quality claims, and (4) implementing fail-fast logic for obviously bad answers.

## Idea Evolution

### Original Concept
Optimize the confidence scoring step to reduce execution time from ~12-24 seconds without changing the concurrency limit or sacrificing accuracy.

### Refined Understanding
The problem isn't just about speed - it's about unnecessary work. The current system:
- Extracts ALL claims (including trivial ones)
- Checks EVERY claim sequentially (even when early results indicate problems)
- Duplicates faithfulness checking (panel evaluator already does holistic check)
- Makes N separate LLM calls when batching could reduce to N/4

### Key Clarifications Made
- Accuracy is non-negotiable - any optimization must maintain quality
- All claims are important, but we can be smarter about extraction
- Tiered evaluation is acceptable (cheap checks before expensive ones)
- Fail-fast is acceptable when confidence is obviously low
- The orchestration chain may not be optimal - worth investigating

## Analysis Results

### Strengths (Yellow Hat)
- Existing `PanelEvaluatorService` already performs holistic faithfulness check (single LLM call)
- SU score calculation and aggregation are already fast (pure math, no LLM)
- Codebase has patterns for parallel execution (`Promise.all`) and early termination (`break`)
- Feature flags exist for enabling/disabling confidence scoring

### Risks & Concerns (Black Hat + Premortem)
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Batched prompts exceed token limits | Medium | High | Limit batch size to 3-5 claims, chunk if needed |
| Tiered evaluation misses subtle errors | Low | Medium | Keep detailed check for uncertain range (0.4-0.7) |
| Fail-fast aborts valid unusual answers | Low | Medium | Require 2-3 checks minimum before aborting |
| Fewer claims misses important facts | Medium | High | Test against ground truth, keep Top 5-7 |
| Increased complexity | Medium | Low | Use feature flags, keep old path |

### Gaps Identified
- [ ] **No batch entailment prompt** - Need to design prompt that evaluates multiple claims at once
- [ ] **No panel pre-filter integration** - Need to wire panel evaluator into confidence scoring flow
- [ ] **Claim extraction not optimized** - Current prompt extracts all claims without filtering
- [ ] **No early termination in entailment loop** - Sequential loop always completes
- [ ] **No claim importance scoring** - Claims not prioritized by verification need

### Enhancement Opportunities (SCAMPER)
- **Substitute**: Replace N per-claim LLM calls with batched multi-claim evaluation
- **Combine**: Use panel faithfulness as gate before detailed entailment
- **Adapt**: Adapt RAGAS sampling pattern - verify representative claims, not all
- **Modify**: Modify claim extraction to output fewer, higher-importance claims
- **Put to other use**: Reuse panel faithfulness score as confidence input
- **Eliminate**: Eliminate entailment for claims that can't be verified (opinions)
- **Reverse**: Reverse pipeline: holistic check first, detailed only if uncertain

### Premortem Findings
- **Failure mode**: Token limits exceeded with many claims → **Prevention**: Chunk batches, limit to 5 claims per batch
- **Failure mode**: Subtle inaccuracies missed by tiered approach → **Prevention**: Detailed entailment for 0.4-0.7 faithfulness range
- **Failure mode**: Fail-fast incorrectly rejects valid answers → **Prevention**: Minimum 2-3 claim checks before abort
- **Failure mode**: Complexity makes maintenance hard → **Prevention**: Feature flags, A/B testing capability

## Structured Concept

### Component 1: Batch Entailment Checker
**Purpose**: Evaluate multiple claims in a single LLM call
**Scope**: Replace sequential per-claim entailment with batched evaluation
**Dependencies**: New prompt template, response parser for multi-claim format
**Key Decisions**:
- Batch size: 3-5 claims per batch (balance token limits vs call count)
- Response format: JSON array with verdict per claim

### Component 2: Panel Pre-Filter Gate
**Purpose**: Fast holistic faithfulness check before detailed entailment
**Scope**: Add panel evaluator call at start of confidence scoring
**Dependencies**: Existing `PanelEvaluatorService`, threshold configuration
**Key Decisions**:
- Low threshold: < 0.4 → return low confidence immediately
- High threshold: > 0.85 → return high confidence, skip entailment
- Middle range: 0.4-0.85 → proceed with detailed entailment

### Component 3: Smart Claim Extraction
**Purpose**: Extract fewer, higher-quality claims
**Scope**: Modify claim extraction prompt
**Dependencies**: Updated prompt template, importance filtering logic
**Key Decisions**:
- Max claims: 5-7 most important/verifiable
- Skip types: Opinion claims (can't be entailed)
- Deduplication: Group semantically similar claims

### Component 4: Fail-Fast Logic
**Purpose**: Early termination when confidence is obviously low
**Scope**: Add abort conditions to entailment loop
**Dependencies**: Threshold configuration, minimum check count
**Key Decisions**:
- Trigger: 2+ contradictions in first 3 claims
- Minimum checks: Always check at least 2-3 claims
- Return: Low confidence result with explanation

## Research Findings

### External Best Practices
- **Tiered Evaluation** (60-75% cost reduction): Use heuristics → NLI models → LLM judges in sequence
- **Semantic Clustering** (30-50% reduction): Group similar claims, verify representatives only
- **SEU (Semantic Embedding Uncertainty)**: 10x speedup over traditional semantic entropy
- **RAGAS Pattern**: Periodic sampling and parallel execution for cost control
- **Fail-Fast**: Order evaluations by cost, short-circuit on high-confidence results

### Anti-Patterns to Avoid
- Batching without token limit awareness
- Skipping detailed checks entirely based on holistic score
- Aggressive fail-fast without minimum claim verification
- Over-optimizing extraction to the point of missing important claims

### Codebase Context
**Existing Panel Evaluator**:
- `src/evaluation/services/panel-evaluator.service.ts:125` - `evaluateWithPanel()` for parallel evaluation
- `src/evaluation/prompts/faithfulness.prompt.ts` - Holistic faithfulness prompt (returns 0-1 score)
- Already measures faithfulness + accuracy in single LLM call

**Current Entailment Flow**:
- `src/evaluation/services/confidence-scoring.service.ts:183-199` - Sequential for-loop (bottleneck)
- `src/evaluation/services/entailment-checker.service.ts:162-189` - Per-claim LLM call
- `src/evaluation/services/claim-extractor.service.ts:48-77` - Extracts "all discrete claims"

**Early Termination Pattern**:
- `src/reflection/services/refinement-engine.service.ts:70-129` - Uses `break` for early exit
- Can be adapted for entailment loop

**Integration Point**:
- `src/orchestration/phase-executors/synthesis-phase-executor.ts:179-225` - Where confidence scoring is triggered

## Recommended Next Steps
1. **Implement Panel Pre-Filter** - Lowest risk, reuses existing code, biggest immediate impact
2. **Design Batch Entailment Prompt** - Test with 3-5 claims, measure accuracy vs single-claim
3. **Add Fail-Fast Logic** - Simple loop modification with threshold checks
4. **Optimize Claim Extraction Prompt** - Request top 5-7 claims with importance ranking
5. **Measure & Iterate** - A/B test each optimization, measure time savings vs accuracy

## Ready for Create-Plan
**Yes**

The concept is well-defined and ready for implementation planning.

### Suggested Plan Scope
**Primary deliverables**:
1. Modified `ConfidenceScoringService` with tiered evaluation flow
2. Batch entailment prompt and parser
3. Updated claim extraction prompt with importance filtering
4. Fail-fast logic in entailment loop
5. Configuration for thresholds and feature flags

**Key phases to consider**:
1. Phase 1: Panel pre-filter integration (quick win, low risk)
2. Phase 2: Fail-fast logic (simple, medium impact)
3. Phase 3: Batch entailment (high impact, needs prompt design)
4. Phase 4: Claim extraction optimization (requires testing)

**Critical success factors**:
- Maintain accuracy (measure against baseline)
- Reduce average time by 50%+
- Keep old path available via feature flag
- Add metrics/logging for A/B comparison
