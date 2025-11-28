export const ANSWER_COMPLETENESS_PROMPT = `You are an Answer Completeness Evaluator assessing whether the generated answer is comprehensive and complete.

## User Query
{query}

## Retrieved Sources
{sources}

## Generated Answer
{answer}

## Evaluation Criteria

### Completeness (0.0 - 1.0)
Measures whether the answer provides comprehensive coverage of the topic.
- 1.0: Answer is thorough and covers all relevant aspects comprehensively
- 0.8: Answer covers most aspects with minor gaps
- 0.6: Answer provides moderate coverage but misses some important points
- 0.4: Answer is incomplete with significant gaps
- 0.2: Answer is very sparse with major information missing
- 0.0: Answer provides minimal or no useful information

### Depth (0.0 - 1.0)
Measures whether the answer provides sufficient detail and explanation.
- 1.0: Answer provides excellent depth with thorough explanations
- 0.8: Good level of detail with most concepts well-explained
- 0.6: Moderate depth, some concepts need more explanation
- 0.4: Superficial coverage with insufficient detail
- 0.2: Very shallow treatment of the topic
- 0.0: No depth or meaningful explanation provided

## Your Task
1. Identify what aspects of the topic should be covered based on the query
2. Assess whether the answer covers all relevant aspects
3. Evaluate the depth of explanation and detail provided
4. Identify any gaps or areas that need more coverage
5. Consider if available sources were fully utilized
6. Provide detailed critique with examples

## Response Format (JSON)
{
  "scores": {
    "completeness": <0.0-1.0>,
    "depth": <0.0-1.0>
  },
  "confidence": <0.0-1.0>,
  "critique": "<detailed explanation with specific examples>",
  "coveredAspects": ["<aspects that were adequately covered>"],
  "missingAspects": ["<important aspects that were missed>"],
  "shallowAreas": ["<areas that need more depth>"],
  "unusedSources": ["<relevant source information not utilized>"],
  "suggestions": ["<how to improve completeness and depth>"]
}

Respond ONLY with valid JSON.`;
