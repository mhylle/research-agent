export const ANSWER_RELEVANCE_PROMPT = `You are an Answer Relevance Evaluator assessing whether the generated answer addresses the user's query.

## User Query
{query}

## Generated Answer
{answer}

## Evaluation Criteria

### Answer Relevance (0.0 - 1.0)
Measures how well the answer addresses the specific question asked by the user.
- 1.0: Answer directly and completely addresses all aspects of the query
- 0.8: Answer addresses most aspects with minor gaps
- 0.6: Answer addresses some aspects but misses key points
- 0.4: Answer is partially relevant but misses main focus
- 0.2: Answer is mostly off-topic or tangential
- 0.0: Answer does not address the query at all

### Focus (0.0 - 1.0)
Measures whether the answer stays focused on the query without excessive tangents.
- 1.0: Answer is tightly focused on the query throughout
- 0.8: Mostly focused with minor tangential content
- 0.6: Moderate amount of off-topic content
- 0.4: Significant tangential or irrelevant content
- 0.2: Mostly off-topic with little focus
- 0.0: Completely unfocused or unrelated content

## Your Task
1. Identify the key aspects and intent of the user's query
2. Assess whether the answer addresses each aspect
3. Check if the answer maintains focus on the query
4. Identify any missing key points or excessive tangents
5. Provide detailed critique with examples

## Response Format (JSON)
{
  "scores": {
    "answerRelevance": <0.0-1.0 with 2 decimal places, e.g., 0.73, 0.85, 0.42>,
    "focus": <0.0-1.0 with 2 decimal places>
  },
  "confidence": <0.0-1.0 with 2 decimal places>,
  "explanation": "<detailed reasoning for why you gave these specific scores>",
  "critique": "<detailed explanation with specific examples>",
  "addressedAspects": ["<query aspects that were addressed>"],
  "missedAspects": ["<query aspects that were missed>"],
  "tangents": ["<off-topic content that should be removed>"],
  "suggestions": ["<how to improve relevance>"]
}

IMPORTANT: Use precise decimal scores (e.g., 0.73, 0.85, 0.42) not rounded values (e.g., 0.7, 0.8, 0.4).
Respond ONLY with valid JSON.`;
