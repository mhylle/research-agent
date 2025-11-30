# Dimension-Specific Thresholds Implementation

## Summary

Implemented dimension-specific thresholds for the evaluation system to prevent low-quality plans and answers from passing evaluation despite having acceptable overall scores.

## Problem

The evaluation system was passing evaluations with low dimension scores because it only checked the overall confidence threshold:

**Example from Aarhus Query:**
- **Plan Evaluation**: Passed with overall confidence 0.625
  - queryAccuracy: **0.4** (very low, but ignored)
  - Other dimensions: 0.72-0.8 (good)
- **Answer Evaluation**: Passed with overall confidence 0.68
  - depth: **0.45** (very low, but ignored)
  - completeness: **0.65** (moderate, but ignored)

## Solution

Added dimension-specific thresholds that must be met in addition to the overall threshold.

### Configuration Changes

Updated `EvaluationConfig` interface to include `dimensionThresholds`:

```typescript
planEvaluation: {
  enabled: boolean;
  iterationEnabled: boolean;
  maxAttempts: number;
  passThreshold: number;  // Overall threshold
  dimensionThresholds?: {  // NEW: Per-dimension thresholds
    queryAccuracy?: number;
    queryCoverage?: number;
    intentAlignment?: number;
    scopeAppropriateness?: number;
  };
  failAction: 'continue' | 'warn' | 'block';
}
```

### Default Thresholds

**Plan Evaluation:**
```typescript
dimensionThresholds: {
  queryAccuracy: 0.6,
  queryCoverage: 0.6,
  intentAlignment: 0.6,
  scopeAppropriateness: 0.5,
}
```

**Answer Evaluation:**
```typescript
dimensionThresholds: {
  depth: 0.6,
  completeness: 0.7,
  answerRelevance: 0.7,
  faithfulness: 0.7,
  accuracy: 0.6,
}
```

**Retrieval Evaluation:**
```typescript
dimensionThresholds: {
  contextRecall: 0.5,
  contextPrecision: 0.5,
  sourceQuality: 0.5,
}
```

## Implementation Details

### 1. Helper Method in ScoreAggregatorService

Added `checkDimensionThresholds()` method:

```typescript
checkDimensionThresholds(
  scores: DimensionScores,
  dimensionThresholds?: Record<string, number>,
): { passed: boolean; failingDimensions: string[] }
```

This method:
- Returns `{ passed: true, failingDimensions: [] }` if no thresholds provided (backward compatible)
- Checks each dimension against its threshold
- Returns list of failing dimensions with scores for debugging

### 2. Plan Evaluation Orchestrator

Modified `processAttemptResults()` to check dimension thresholds:

```typescript
// Check dimension-specific thresholds
const dimensionCheck = this.scoreAggregator.checkDimensionThresholds(
  aggregated.scores,
  this.config.planEvaluation.dimensionThresholds,
);

// Evaluation passes only if BOTH overall score AND all dimension thresholds are met
let passed = overallScore >= passThreshold && dimensionCheck.passed;
```

Logs warning when dimension thresholds not met:
```
Dimension thresholds not met: queryAccuracy (0.40 < 0.60)
```

### 3. Answer Evaluator Service

Modified `evaluate()` to check dimension thresholds:

```typescript
// Check dimension-specific thresholds
const dimensionCheck = this.scoreAggregator.checkDimensionThresholds(
  aggregated.scores,
  this.config.answerEvaluation.dimensionThresholds,
);

// Evaluation passes only if BOTH overall score AND all dimension thresholds are met
const passed =
  overallScore >= this.MAJOR_FAILURE_THRESHOLD && dimensionCheck.passed;
```

Provides detailed logging on failure:
```
Answer dimension thresholds not met: depth (0.45 < 0.60), completeness (0.65 < 0.70)
```

## Files Modified

1. **src/evaluation/interfaces/evaluator-config.interface.ts**
   - Added `dimensionThresholds` to config interfaces
   - Added default threshold values

2. **src/evaluation/services/score-aggregator.service.ts**
   - Added `checkDimensionThresholds()` helper method

3. **src/evaluation/services/plan-evaluation-orchestrator.service.ts**
   - Integrated dimension threshold checking
   - Updated pass/fail logic

4. **src/evaluation/services/answer-evaluator.service.ts**
   - Integrated dimension threshold checking
   - Updated pass/fail logic

5. **src/evaluation/services/score-aggregator.service.spec.ts**
   - Added 6 new tests for dimension threshold functionality

6. **src/evaluation/services/plan-evaluation-orchestrator.service.spec.ts**
   - Updated existing tests with dimension threshold mocks
   - Added 2 integration tests for dimension threshold enforcement

## Test Coverage

Added comprehensive tests:

### Unit Tests (ScoreAggregatorService)
- ✓ should pass when no thresholds are provided
- ✓ should pass when all dimensions meet thresholds
- ✓ should fail when one dimension is below threshold
- ✓ should fail when multiple dimensions are below threshold
- ✓ should only check dimensions that have thresholds
- ✓ should handle missing score dimensions gracefully

### Integration Tests (PlanEvaluationOrchestratorService)
- ✓ should fail when dimension threshold is not met even with high overall score
- ✓ should pass when both overall score and dimension thresholds are met

All tests pass: **17/17 passed**

## Verification with Real Data

Verified implementation with Aarhus query data from `test-planner-validation.md`:

### Plan Evaluation
**OLD Behavior:**
- Overall confidence: 0.625 < 0.65 → FAILED (by overall threshold)
- queryAccuracy: 0.4 (ignored)

**NEW Behavior:**
- Overall confidence: 0.625 < 0.65 → Would fail anyway
- queryAccuracy: 0.4 < 0.6 → FAILED (by dimension threshold)
- Result: **Correctly rejects low queryAccuracy**

### Answer Evaluation
**OLD Behavior:**
- Overall confidence: 0.68 > 0.5 → PASSED
- depth: 0.45 (ignored)
- completeness: 0.65 (ignored)

**NEW Behavior:**
- Overall confidence: 0.68 > 0.5 → Would pass
- depth: 0.45 < 0.6 → FAILED
- completeness: 0.65 < 0.7 → FAILED
- Result: **Correctly rejects shallow answers**

## Backward Compatibility

- Dimension thresholds are optional (`dimensionThresholds?: { ... }`)
- If not provided, evaluation behaves as before (only checks overall threshold)
- Existing code continues to work without modification

## Impact

### Immediate Benefits
1. **Prevents low-quality plans** with poor search queries from passing
2. **Prevents shallow answers** from being accepted
3. **More granular quality control** per evaluation dimension
4. **Better debugging** with explicit failing dimension information

### Example Use Cases
1. **Event queries**: Reject plans with low queryAccuracy that produce generic results
2. **Research questions**: Reject answers with low depth/completeness
3. **Fact-checking**: Enforce high faithfulness and accuracy thresholds

## Future Enhancements

1. **Dynamic thresholds** based on query type
2. **Weighted dimension scoring** (already partially implemented)
3. **Per-evaluator dimension thresholds** for fine-grained control
4. **Threshold learning** from user feedback

## Related Issues

Addresses recommendations from `test-planner-validation.md`:
- ✓ "Add dimension-specific thresholds" (Section: Recommendations #1)
- ✓ "Lower queryAccuracy threshold rejection" (Quick Wins #1)
- ✓ "Increase depth threshold for event queries" (Quick Wins #3)

## Migration Guide

No migration needed - dimension thresholds are optional and backward compatible.

To enable dimension thresholds in custom configurations:

```typescript
import { DEFAULT_EVALUATION_CONFIG } from './interfaces';

const customConfig = {
  ...DEFAULT_EVALUATION_CONFIG,
  planEvaluation: {
    ...DEFAULT_EVALUATION_CONFIG.planEvaluation,
    dimensionThresholds: {
      queryAccuracy: 0.7,  // Stricter than default 0.6
      queryCoverage: 0.8,
    },
  },
};
```
