# Debug Report: Aarhus Events Query Quality Issue

## Problem Summary
User asked: "Hvad sker der i Aarhus i dag og i morgen?" (What's happening in Aarhus today and tomorrow?)

**Expected Result**: Actual event listings with names, times, venues, descriptions
**Actual Result**: Generic platform links (Eventbrite, allevents.in) without specific event details

## Session Details
- **Session ID**: `85467e0d-083b-47a1-8898-5c6e0fd38e1a`
- **Timestamp**: 2025-11-29T18:24:55.551Z
- **Status**: Completed
- **Total Duration**: 144.7 seconds
- **Phases**: 4
- **Tool Calls**: 4

## Root Cause Analysis

### 1. Planning Phase Issues

**Problem**: The planner created phases with no concrete steps

The system experienced **auto-recovery** after multiple finalize failures:
```json
{
  "reason": "Auto-adding default steps after multiple finalize failures",
  "emptyPhaseCount": 4,
  "failureCount": 2
}
```

**Created Phases** (auto-recovery):
1. **Initial Search**: "Search for events and news in Aarhus for today and tomorrow"
   - Tool: `tavily_search` (auto-added)

2. **Synthesis & Answer Generation**: "Generate final answer based on search results"
   - Tool: `synthesize` (auto-added)

**Critical Issue**: No `web_fetch` steps were planned to extract actual event details from the search results.

### 2. Search Query Quality

**Search Query Used**:
```
"Search for events and news in Aarhus for today and tomorrow"
```

**Issues**:
- Generic query phrasing
- No specific date (should include actual dates: "November 29-30, 2025")
- Query is in English, but user asked in Danish (language mismatch)
- No specific event types mentioned

**Better Query Would Be**:
```
"events Aarhus November 29 2025"
"events Aarhus November 30 2025"
"Aarhus begivenheder 29 november 2025"  (Danish)
```

### 3. Search Results Analysis

**Tavily Search Returned**:
```json
[
  {
    "title": "Things to Do in Aarhus, Denmark Tomorrow - Events & Activities",
    "url": "https://www.eventbrite.com/d/denmark--%C3%A5rhus/events--tomorrow/",
    "content": "Find events happening tomorrow in Aarhus, Denmark...",
    "score": 0.79
  },
  {
    "title": "All Events in Arhus, Today and Upcoming Events in Arhus",
    "url": "https://allevents.in/arhus/all?page=2",
    "content": "All events in Arhus, Find information and tickets...",
    "score": 0.78
  }
]
```

**Problem**: Search results are just aggregator landing pages, not specific events.

**What Should Have Happened**:
1. Search for events
2. **Identify that results are aggregator pages** (not actual events)
3. **Use `web_fetch` to extract event details** from these pages
4. Synthesize actual event information (names, times, venues)

### 4. Plan Evaluation Scores

**Plan Quality Evaluation**:
```json
{
  "passed": true,
  "confidence": 0.625,
  "scores": {
    "intentAlignment": 0.72,
    "confidence": 0.85,
    "queryCoverage": 0.8,
    "queryAccuracy": 0.4,  // ⚠️ LOW SCORE
    "scopeAppropriateness": 0.8
  }
}
```

**Critical Finding**: `queryAccuracy` score was only **0.4** (40%)!

This indicates the evaluator detected the search query was not accurate/specific enough, but the plan still **passed** because the overall confidence (0.625) met the threshold.

**Threshold Issue**: The evaluation threshold may be too lenient for query-specific accuracy.

### 5. Retrieval Quality Evaluation

**Retrieval Evaluation**:
```json
{
  "passed": true,
  "confidence": 0.91,
  "scores": {
    "contextRecall": 0.9,
    "contextPrecision": 0.95,
    "sourceQuality": 0.82,
    "coverageCompleteness": 0.75
  }
}
```

**Problem**: High scores despite not having actual event details!

The evaluator seems to be measuring:
- Whether sources were retrieved (yes)
- Whether sources are about Aarhus events (yes)

But NOT:
- Whether sources contain **actual event listings** vs. just aggregator links
- Whether the content has **actionable information** (event names, times, venues)

### 6. Answer Quality Evaluation

**Answer Evaluation**:
```json
{
  "passed": true,
  "confidence": 0.68,
  "scores": {
    "answerRelevance": 0.92,
    "focus": 0.98,
    "completeness": 0.65,  // ⚠️ MODERATE
    "depth": 0.45          // ⚠️ LOW SCORE
  }
}
```

**Critical Findings**:
- `depth` score: **0.45** (45%) - Very low!
- `completeness` score: **0.65** (65%) - Below ideal

The evaluator **detected the problem** (low depth, moderate completeness) but the answer still **passed** (confidence 0.68 > threshold).

### 7. Synthesis Phase Issue

The synthesize step received:
- Generic aggregator links
- No actual event details

And correctly generated an answer that:
- Acknowledged the lack of specific details
- Provided links for users to check themselves
- Was honest about limitations

**However**: This is not what the user wanted! User expected actual event listings.

## Failure Points in Pipeline

1. ❌ **Planning Phase**: No web_fetch steps planned to extract event details
2. ⚠️ **Search Query**: Generic, English (not Danish), no specific dates
3. ⚠️ **Search Results**: Only returned aggregator pages, not actual events
4. ❌ **Missing Fetch Phase**: Should have fetched event pages to extract details
5. ⚠️ **Evaluation Thresholds**: Plan passed despite low queryAccuracy (0.4)
6. ⚠️ **Retrieval Evaluation**: Didn't detect lack of actionable event information
7. ⚠️ **Answer Evaluation**: Detected low depth (0.45) but still passed

## Recommendations

### 1. Improve Plan Evaluation Thresholds

**Current**: Plan passes with overall confidence 0.625
**Problem**: `queryAccuracy` was only 0.4, but plan still passed

**Solution**: Add dimension-specific thresholds:
```typescript
{
  overallThreshold: 0.65,
  dimensionThresholds: {
    queryAccuracy: 0.6,  // Require at least 60% query accuracy
    intentAlignment: 0.7,
    queryCoverage: 0.7
  }
}
```

### 2. Enhance Search Query Generation

**Issues**:
- Generic phrasing
- Language mismatch (English vs. Danish)
- No specific dates

**Solution**: Improve query generation in planner:
```typescript
// Detect user language
const userLanguage = detectLanguage(userQuery); // "da" for Danish

// Extract temporal information
const dates = extractDates(userQuery); // ["2025-11-29", "2025-11-30"]

// Generate language-specific queries
const queries = [
  `events Aarhus ${dates[0]}`,
  `events Aarhus ${dates[1]}`,
  ...(userLanguage === 'da' ? [
    `begivenheder Aarhus ${dates[0]}`,
    `begivenheder Aarhus ${dates[1]}`
  ] : [])
];
```

### 3. Add Result Type Detection

**Problem**: System didn't detect that search results were aggregator pages

**Solution**: Add classification step:
```typescript
interface SearchResultClassification {
  type: 'aggregator' | 'specific_event' | 'news_article' | 'directory';
  actionableInfo: boolean;
  needsExtraction: boolean;
}

// If type === 'aggregator' && !actionableInfo
// → Trigger web_fetch to extract actual listings
```

### 4. Improve Retrieval Evaluation

**Current**: Only checks if sources are relevant
**Missing**: Checks if sources contain actionable information

**Solution**: Add new dimension:
```typescript
{
  actionableInformation: {
    description: "Does the content contain specific, actionable details (dates, times, names)?",
    weight: 0.2
  }
}
```

### 5. Stricter Answer Evaluation Thresholds

**Current**: Answer passes with depth=0.45
**Problem**: User expects detailed answers, not generic links

**Solution**: Adjust thresholds based on query type:
```typescript
if (queryType === 'event_listing') {
  thresholds.depth = 0.7;  // Require 70% depth for event queries
  thresholds.completeness = 0.8;
}
```

### 6. Add Follow-Up Fetch Phase

**When**:
- Search returns aggregator pages
- Low actionable information score
- User query requires specific details

**What**:
```typescript
{
  phase: "Detail Extraction",
  steps: [
    {
      tool: "web_fetch",
      url: topSearchResults[0].url,
      extract: "event listings with names, dates, times, venues"
    }
  ]
}
```

### 7. Implement Quality Gates

**Before Synthesis**:
- Check if retrieved content has sufficient detail
- If not, trigger re-planning or additional fetch steps
- Set minimum information threshold for event queries

**Gate Logic**:
```typescript
if (queryType === 'event_listing' && actionableInfoScore < 0.6) {
  // Trigger re-plan with web_fetch steps
  return { needsReplan: true, reason: "Insufficient event details" };
}
```

## Quick Wins

1. **Lower queryAccuracy threshold rejection**: If < 0.6, fail the plan
2. **Add actionableInformation dimension** to retrieval evaluation
3. **Increase depth threshold** for event queries to 0.7
4. **Add result type detection** to identify aggregator pages
5. **Auto-trigger web_fetch** when search results are aggregators

## Test Cases

### Test 1: Aarhus Events (Current Failure)
```
Query: "Hvad sker der i Aarhus i dag og i morgen?"
Expected: Specific event names, times, venues
Actual: Generic platform links ❌
```

### Test 2: Should Trigger Web Fetch
```
Query: "What concerts are in Copenhagen this weekend?"
Expected Plan:
1. Search for Copenhagen concerts
2. Detect aggregator results
3. Fetch event pages to extract details
4. Synthesize specific event list
```

### Test 3: Language-Specific Queries
```
Query: "Hvilke koncerter er der i København denne weekend?" (Danish)
Expected: Search queries in Danish, not just English
```

## Conclusion

**Primary Failure**: Planning phase didn't include web_fetch steps to extract event details from aggregator pages.

**Secondary Issues**:
- Generic search queries without specific dates
- Language mismatch (English queries for Danish question)
- Evaluation thresholds too lenient for low queryAccuracy and depth
- No detection of "aggregator page" vs "actual event listing"

**Impact**: User received generic links instead of specific event information, defeating the purpose of the research agent.

**Severity**: High - Core use case failure for event/listing queries
