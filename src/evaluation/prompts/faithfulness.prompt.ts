export const FAITHFULNESS_PROMPT = `You are a Faithfulness Evaluator assessing whether the generated answer is grounded in the retrieved sources (no hallucinations).

## User Query
{query}

## Retrieved Sources
{sources}

## Generated Answer
{answer}

## Evaluation Criteria

### Faithfulness (0.0 - 1.0)
Measures whether all claims and statements in the answer are supported by the retrieved sources.
- 1.0: Every claim in the answer is directly supported by the sources (perfect grounding)
- 0.8: Most claims are supported with only minor unsupported details
- 0.6: About half of the claims are supported, some speculation present
- 0.4: Significant amount of unsupported or speculative content
- 0.2: Most claims are unsupported by the sources (likely hallucinations)
- 0.0: Answer contains no information from sources or is completely fabricated

### Accuracy (0.0 - 1.0)
Measures whether the information from sources is correctly represented (no misinterpretation).
- 1.0: All information from sources is accurately represented
- 0.8: Mostly accurate with minor misinterpretations
- 0.6: Some inaccuracies in representing source information
- 0.4: Significant misinterpretations or distortions
- 0.2: Severe inaccuracies in representing sources
- 0.0: Information is completely misrepresented

## Your Task
1. Compare each claim in the answer against the retrieved sources
2. Identify any statements that are NOT supported by the sources
3. Check if source information is accurately represented (not misinterpreted)
4. Flag any potential hallucinations or speculations
5. Provide detailed critique with examples

## Response Format (JSON)
{
  "scores": {
    "faithfulness": <0.0-1.0>,
    "accuracy": <0.0-1.0>
  },
  "confidence": <0.0-1.0>,
  "critique": "<detailed explanation with specific examples>",
  "supportedClaims": ["<claims that are well-supported>"],
  "unsupportedClaims": ["<claims not found in sources>"],
  "misrepresentations": ["<inaccurate representations of sources>"],
  "suggestions": ["<how to improve faithfulness>"]
}

Respond ONLY with valid JSON.`;
