import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from '../../llm/ollama.service';
import { EvaluatorResult, DEFAULT_EVALUATION_CONFIG } from '../interfaces';
import {
  INTENT_ANALYST_PROMPT,
  COVERAGE_CHECKER_PROMPT,
  SOURCE_RELEVANCE_PROMPT,
  SOURCE_QUALITY_PROMPT,
  COVERAGE_COMPLETENESS_PROMPT,
  FAITHFULNESS_PROMPT,
  ANSWER_RELEVANCE_PROMPT,
  ANSWER_COMPLETENESS_PROMPT,
} from '../prompts';

type EvaluatorRole =
  | 'intentAnalyst'
  | 'coverageChecker'
  | 'faithfulnessJudge'
  | 'qualityAssessor'
  | 'factChecker'
  | 'sourceRelevance'
  | 'sourceQuality'
  | 'coverageCompleteness'
  | 'faithfulness'
  | 'answerRelevance'
  | 'answerCompleteness';

@Injectable()
export class PanelEvaluatorService {
  private readonly logger = new Logger(PanelEvaluatorService.name);
  private readonly config = DEFAULT_EVALUATION_CONFIG;

  private readonly prompts: Record<EvaluatorRole, string> = {
    intentAnalyst: INTENT_ANALYST_PROMPT,
    coverageChecker: COVERAGE_CHECKER_PROMPT,
    faithfulnessJudge: '', // To be added (legacy)
    qualityAssessor: '', // To be added (legacy)
    factChecker: '', // To be added (legacy)
    sourceRelevance: SOURCE_RELEVANCE_PROMPT,
    sourceQuality: SOURCE_QUALITY_PROMPT,
    coverageCompleteness: COVERAGE_COMPLETENESS_PROMPT,
    faithfulness: FAITHFULNESS_PROMPT,
    answerRelevance: ANSWER_RELEVANCE_PROMPT,
    answerCompleteness: ANSWER_COMPLETENESS_PROMPT,
  };

  constructor(private readonly ollamaService: OllamaService) {}

  async evaluateWithRole(
    role: EvaluatorRole,
    context: { query: string; plan: any; searchQueries?: string[]; sources?: string; answer?: string },
  ): Promise<EvaluatorResult> {
    const startTime = Date.now();
    const roleConfig = this.config.evaluators[role];
    const model = roleConfig.model;

    try {
      const prompt = this.buildPrompt(role, context);

      const response = await this.ollamaService.chat(
        [{ role: 'user', content: prompt }],
        [],
        model,
      );

      const content = response.message.content;
      const parsed = this.parseResponse(content);

      const result = {
        role,
        model,
        dimensions: roleConfig.dimensions,
        scores: parsed.scores || {},
        confidence: parsed.confidence || 0.5,
        explanation: parsed.explanation || '',
        critique: parsed.critique || '',
        rawResponse: content,
        latency: Date.now() - startTime,
        tokensUsed: 0, // Would need token counting
      };

      // Log what we're returning to debug missing explanations
      this.logger.debug(`[evaluateWithRole] ${role} result - explanation: "${result.explanation?.substring(0, 100)}...", scores: ${JSON.stringify(result.scores)}`);

      return result;
    } catch (error) {
      this.logger.error(`Evaluator ${role} failed: ${error.message}`);
      return {
        role,
        model,
        dimensions: roleConfig.dimensions,
        scores: {},
        confidence: 0.1,
        explanation: '',
        critique: `Evaluation failed: ${error.message}`,
        rawResponse: '',
        latency: Date.now() - startTime,
        tokensUsed: 0,
      };
    }
  }

  async evaluateWithPanel(
    roles: EvaluatorRole[],
    context: { query: string; plan: any; searchQueries?: string[]; sources?: string; answer?: string },
  ): Promise<EvaluatorResult[]> {
    console.log(`[PanelEvaluatorService] evaluateWithPanel called with roles:`, roles);
    console.log(`[PanelEvaluatorService] Context query:`, context.query);

    const evaluations = roles.map((role) =>
      this.evaluateWithRole(role, context),
    );
    const results = await Promise.all(evaluations);

    console.log(`[PanelEvaluatorService] Panel evaluation completed, ${results.length} results`);
    return results;
  }

  private buildPrompt(
    role: EvaluatorRole,
    context: { query: string; plan: any; searchQueries?: string[]; sources?: string; answer?: string },
  ): string {
    let template = this.prompts[role];

    // Inject current date and year for temporal awareness
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentYear = now.getFullYear().toString();

    template = template.replace('{currentDate}', currentDate);
    template = template.replace('{currentYear}', currentYear);

    template = template.replace('{query}', context.query);
    template = template.replace('{plan}', JSON.stringify(context.plan, null, 2));

    if (context.searchQueries) {
      template = template.replace(
        '{searchQueries}',
        context.searchQueries.join('\n'),
      );
    }

    if (context.sources) {
      template = template.replace('{sources}', context.sources);
    }

    if (context.answer) {
      template = template.replace('{answer}', context.answer);
    }

    return template;
  }

  private parseResponse(content: string): any {
    try {
      // Log the raw response for debugging
      this.logger.debug(`[parseResponse] Raw content: ${content.substring(0, 500)}...`);

      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Log what we parsed to debug missing explanations and score precision
        this.logger.debug(`[parseResponse] Parsed JSON: ${JSON.stringify(parsed, null, 2)}`);

        // Check if scores need to be converted from 0-10 scale to 0-1 scale
        if (parsed.scores) {
          for (const [key, value] of Object.entries(parsed.scores)) {
            if (typeof value === 'number' && value > 1) {
              this.logger.warn(`[parseResponse] Score ${key} is ${value}, converting from 0-10 to 0-1 scale`);
              parsed.scores[key] = value / 10;
            }
          }
        }

        return parsed;
      }
      return { confidence: 0.3, critique: 'Could not parse response' };
    } catch (error) {
      this.logger.error(`[parseResponse] Parse error: ${error.message}`);
      return { confidence: 0.3, critique: 'Invalid JSON response' };
    }
  }
}
