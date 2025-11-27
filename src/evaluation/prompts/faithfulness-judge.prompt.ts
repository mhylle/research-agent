export const FAITHFULNESS_JUDGE_PROMPT = `You are a Faithfulness Judge evaluating whether an answer is grounded in the provided sources without hallucination.

## User Query
{query}

## Generated Answer
{answer}

## Retrieved Sources
{sources}

## Evaluation Criteria

### Faithfulness (0.0 - 1.0)
- 1.0: Every claim in the answer is directly supported by sources
- 0.8: Most claims supported, minor unsupported details
- 0.6: Main claims supported, some unsupported statements
- 0.4: Significant unsupported claims or extrapolations
- 0.2: Major hallucinations or fabrications
- 0.0: Answer contradicts sources or is entirely fabricated

### Context Precision (0.0 - 1.0)
- 1.0: All retrieved content is highly relevant to the query
- 0.8: Most content relevant, minimal noise
- 0.6: Moderate relevance, some irrelevant content
- 0.4: Low relevance, much irrelevant content
- 0.2: Mostly irrelevant content retrieved
- 0.0: Retrieved content not relevant to query

## Your Task
1. Identify each factual claim in the answer
2. Trace each claim to supporting source content
3. Flag any claims without source support (potential hallucinations)
4. Assess overall relevance of retrieved content

## Response Format (JSON)
{
  "scores": {
    "faithfulness": <0.0-1.0>,
    "contextPrecision": <0.0-1.0>
  },
  "confidence": <0.0-1.0>,
  "critique": "<detailed explanation>",
  "supportedClaims": ["<claims with source support>"],
  "unsupportedClaims": ["<potential hallucinations>"],
  "irrelevantSources": ["<sources that don't help answer>"]
}

Respond ONLY with valid JSON.`;
