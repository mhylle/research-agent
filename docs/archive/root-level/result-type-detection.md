# Result Type Detection and Actionable Information Scoring

## Overview

This feature adds intelligent classification of search results to detect when retrieved content is an aggregator page (like event listings) versus specific content (like individual event pages). This enables automatic triggering of web_fetch extraction to get the actual detailed information.

## Problem Statement

Search engines often return aggregator pages (Eventbrite listings, allevents.in browse pages) instead of specific event pages. The system was accepting these as valid results, leading to generic answers like "Check Eventbrite for events" instead of providing actual event details.

## Solution

### 1. Result Classification

New `ResultClassifierService` that categorizes each retrieved result into:

- **SPECIFIC_CONTENT**: Actual events, articles, specific information
  - Has concrete details: dates, times, locations, prices
  - URL contains specific identifiers (event IDs, slugs)
  - Low link density, high content density

- **AGGREGATOR**: Event listings, search results, directory pages
  - URLs contain: "search", "events", "all", "category", "listings"
  - High link density (many "Read more", "View event" links)
  - Titles like "All Events in...", "Find Events", "Browse..."

- **NAVIGATION**: Homepage, category pages, general navigation
  - Neither specific nor aggregator
  - Generic content without specific details

### 2. Actionable Information Dimension

New dimension in retrieval evaluation: `actionableInformation`

**Scoring Logic:**
- SPECIFIC_CONTENT with rich details → 0.9-1.0
- SPECIFIC_CONTENT with minimal details → 0.6-0.8
- AGGREGATOR with some content → 0.3-0.5
- AGGREGATOR with mostly links → 0.0-0.2
- NAVIGATION → 0.4

**Detection Heuristics:**

Date patterns:
- `\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}` (e.g., 29/11/2024)
- `Nov 29`, `29 Nov`

Time patterns:
- `8:00 PM`, `7:30pm`

Location patterns:
- `Venue: Blue Note`, `Location: 123 Street`
- Street addresses

Price patterns:
- `Price: $25`, `$40`, `Free admission`

### 3. Retrieval Evaluation Integration

**Updated Weights:**
```typescript
{
  contextRecall: 0.3,
  contextPrecision: 0.25,
  sourceQuality: 0.2,
  actionableInformation: 0.25  // NEW
}
```

**Dimension Thresholds:**
```typescript
{
  contextRecall: 0.5,
  contextPrecision: 0.5,
  sourceQuality: 0.5,
  actionableInformation: 0.6  // NEW - requires specific content
}
```

### 4. Automatic Extraction Triggering

If retrieval evaluation detects:
- `actionableInformation < 0.6`
- Most results classified as AGGREGATOR

Then:
- Set `needsExtraction: true`
- Provide `extractionReason` explaining why
- Log warning for orchestrator to re-plan with web_fetch

## Implementation Details

### Files Created

1. **`src/evaluation/services/result-classifier.service.ts`**
   - Result classification logic
   - Pattern matching for aggregators
   - Specificity scoring based on content indicators
   - Aggregate statistics calculation

2. **`src/evaluation/services/result-classifier.service.spec.ts`**
   - Unit tests for classifier
   - Test cases for aggregator detection
   - Test cases for specific content detection

### Files Modified

1. **`src/evaluation/interfaces/dimension-scores.interface.ts`**
   - Added `actionableInformation: number` to `RetrievalDimensionScores`

2. **`src/evaluation/interfaces/evaluator-config.interface.ts`**
   - Added `actionableInformation?: number` to retrieval dimension thresholds
   - Set default threshold to 0.6

3. **`src/evaluation/services/retrieval-evaluator.service.ts`**
   - Integrated `ResultClassifierService`
   - Classify results before evaluation
   - Calculate actionable information score
   - Check if extraction needed
   - Include classification in source details

4. **`src/evaluation/services/retrieval-evaluator.service.spec.ts`**
   - Updated to mock `ResultClassifierService`
   - Added test for aggregator detection

5. **`src/evaluation/evaluation.module.ts`**
   - Added `ResultClassifierService` to providers and exports

### Result Structure Updates

**RetrievalEvaluationResult now includes:**
```typescript
{
  passed: boolean;
  scores: {
    contextRecall: number;
    contextPrecision: number;
    sourceQuality: number;
    actionableInformation: number;  // NEW
  };
  sourceDetails: [{
    url: string;
    relevanceScore: number;
    qualityScore: number;
    resultType?: ResultType;        // NEW
    actionableScore?: number;       // NEW
  }];
  needsExtraction?: boolean;        // NEW
  extractionReason?: string;        // NEW
}
```

## Usage Examples

### Example 1: Aggregator Detection

**Input:**
```typescript
{
  query: "events in Aarhus today",
  retrievedContent: [
    {
      url: "https://www.eventbrite.com/d/denmark--århus/events--today/",
      title: "All Events in Aarhus - Today",
      content: "Find events... Event 1: Read more, Event 2: Read more..."
    }
  ]
}
```

**Output:**
```typescript
{
  passed: false,
  scores: {
    contextRecall: 0.5,
    contextPrecision: 0.5,
    sourceQuality: 0.6,
    actionableInformation: 0.2  // LOW - aggregator detected
  },
  sourceDetails: [{
    url: "https://www.eventbrite.com/d/denmark--århus/events--today/",
    relevanceScore: 0.5,
    qualityScore: 0.6,
    resultType: "AGGREGATOR",
    actionableScore: 0.2
  }],
  needsExtraction: true,
  extractionReason: "Retrieved content is mostly aggregator pages (1/1). Average actionable score: 0.20 < 0.6. Web fetch extraction recommended to get specific content."
}
```

### Example 2: Specific Content

**Input:**
```typescript
{
  query: "jazz concert November 29",
  retrievedContent: [
    {
      url: "https://example.com/events/jazz-concert-nov-29",
      title: "Jazz Concert at Blue Note - November 29",
      content: "Date: November 29, 2024, Time: 8:00 PM, Venue: Blue Note, Price: $25..."
    }
  ]
}
```

**Output:**
```typescript
{
  passed: true,
  scores: {
    contextRecall: 0.85,
    contextPrecision: 0.9,
    sourceQuality: 0.8,
    actionableInformation: 0.95  // HIGH - specific event details
  },
  sourceDetails: [{
    url: "https://example.com/events/jazz-concert-nov-29",
    relevanceScore: 0.875,
    qualityScore: 0.8,
    resultType: "SPECIFIC_CONTENT",
    actionableScore: 0.95
  }],
  needsExtraction: false
}
```

## Test Results

All tests passing:

**ResultClassifierService:**
- ✓ Classifies Eventbrite listing as AGGREGATOR with low actionable score
- ✓ Classifies specific event page as SPECIFIC_CONTENT with high actionable score
- ✓ Classifies allevents.in listing as AGGREGATOR
- ✓ Detects specific event with date and time
- ✓ Handles missing title gracefully
- ✓ Detects high link density in aggregator pages
- ✓ Calculates aggregate statistics correctly
- ✓ Suggests extraction when all results are aggregators

**RetrievalEvaluatorService:**
- ✓ Evaluates retrieval and returns scores including actionableInformation
- ✓ Flags severe failures when score < 0.5
- ✓ Detects aggregator pages and suggests extraction

## Next Steps

### Integration with Orchestrator

The orchestrator needs to check for `needsExtraction` flag and trigger re-planning:

```typescript
if (retrievalEvaluation.needsExtraction) {
  logger.warn(`Extraction needed: ${retrievalEvaluation.extractionReason}`);

  // Re-plan with web_fetch steps to extract specific content
  const newPlan = await planner.replan({
    query,
    reason: 'aggregator_detected',
    extractionTargets: retrievalEvaluation.sourceDetails
      .filter(s => s.resultType === 'AGGREGATOR')
      .map(s => s.url)
  });

  // Execute new plan with web_fetch
}
```

### Configuration

Thresholds can be adjusted via config:

```typescript
retrievalEvaluation: {
  dimensionThresholds: {
    actionableInformation: 0.6  // Adjust threshold as needed
  }
}
```

### Monitoring

Log aggregator detection for analysis:
- Track aggregator detection rate
- Monitor extraction trigger frequency
- Measure improvement in answer quality after extraction

## Benefits

1. **Automatic Detection**: No manual rules needed for specific sites
2. **Quality Improvement**: Ensures specific content is retrieved
3. **User Experience**: Better answers with actual event details
4. **Extensible**: Pattern matching can be enhanced for other domains
5. **Transparent**: Clear logging of why extraction is needed
