import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from '../../llm/ollama.service';
import { EvaluatorResult, DEFAULT_EVALUATION_CONFIG } from '../interfaces';
import { INTENT_ANALYST_PROMPT, COVERAGE_CHECKER_PROMPT } from '../prompts';

type EvaluatorRole =
  | 'intentAnalyst'
  | 'coverageChecker'
  | 'faithfulnessJudge'
  | 'qualityAssessor'
  | 'factChecker';

@Injectable()
export class PanelEvaluatorService {
  private readonly logger = new Logger(PanelEvaluatorService.name);
  private readonly config = DEFAULT_EVALUATION_CONFIG;

  private readonly prompts: Record<EvaluatorRole, string> = {
    intentAnalyst: INTENT_ANALYST_PROMPT,
    coverageChecker: COVERAGE_CHECKER_PROMPT,
    faithfulnessJudge: '', // To be added
    qualityAssessor: '', // To be added
    factChecker: '', // To be added
  };

  constructor(private readonly ollamaService: OllamaService) {}

  async evaluateWithRole(
    role: EvaluatorRole,
    context: { query: string; plan: any; searchQueries?: string[] },
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

      return {
        role,
        model,
        dimensions: roleConfig.dimensions,
        scores: parsed.scores || {},
        confidence: parsed.confidence || 0.5,
        critique: parsed.critique || '',
        rawResponse: content,
        latency: Date.now() - startTime,
        tokensUsed: 0, // Would need token counting
      };
    } catch (error) {
      this.logger.error(`Evaluator ${role} failed: ${error.message}`);
      return {
        role,
        model,
        dimensions: roleConfig.dimensions,
        scores: {},
        confidence: 0.1,
        critique: `Evaluation failed: ${error.message}`,
        rawResponse: '',
        latency: Date.now() - startTime,
        tokensUsed: 0,
      };
    }
  }

  async evaluateWithPanel(
    roles: EvaluatorRole[],
    context: { query: string; plan: any; searchQueries?: string[] },
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
    context: { query: string; plan: any; searchQueries?: string[] },
  ): string {
    let template = this.prompts[role];

    template = template.replace('{query}', context.query);
    template = template.replace('{plan}', JSON.stringify(context.plan, null, 2));

    if (context.searchQueries) {
      template = template.replace(
        '{searchQueries}',
        context.searchQueries.join('\n'),
      );
    }

    return template;
  }

  private parseResponse(content: string): any {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { confidence: 0.3, critique: 'Could not parse response' };
    } catch {
      return { confidence: 0.3, critique: 'Invalid JSON response' };
    }
  }
}
