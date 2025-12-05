import { Injectable, Logger } from '@nestjs/common';
import { LLMService } from '../../llm/llm.service';
import {
  EvaluatorResult,
  EscalationResult,
  DEFAULT_EVALUATION_CONFIG,
  DimensionScores,
} from '../interfaces';
import { ESCALATION_META_PROMPT } from '../prompts/escalation-meta.prompt';

export interface EscalationInput {
  trigger: 'low_confidence' | 'disagreement' | 'borderline';
  query: string;
  content: any;
  panelResults: EvaluatorResult[];
}

@Injectable()
export class EscalationHandlerService {
  private readonly logger = new Logger(EscalationHandlerService.name);
  private readonly config = DEFAULT_EVALUATION_CONFIG;

  constructor(private readonly ollamaService: LLMService) {}

  async escalate(input: EscalationInput): Promise<EscalationResult> {
    const startTime = Date.now();
    this.logger.log(
      `Escalating to ${this.config.escalationModel} due to: ${input.trigger}`,
    );

    try {
      const prompt = this.buildPrompt(input);

      const response = await this.ollamaService.chat(
        [{ role: 'user', content: prompt }],
        [],
        this.config.escalationModel,
      );

      const parsed = this.parseResponse(response.message.content);

      return {
        trigger: input.trigger,
        model: this.config.escalationModel,
        panelReview: parsed.synthesis || '',
        trustDecisions: this.flattenTrustDecisions(parsed.trustDecisions),
        finalVerdict: parsed.finalVerdict || 'fail',
        scores: parsed.resolvedScores || {},
        latency: Date.now() - startTime,
        tokensUsed: 0,
      };
    } catch (error) {
      this.logger.error(`Escalation failed: ${error.message}`);
      return {
        trigger: input.trigger,
        model: this.config.escalationModel,
        panelReview: `Escalation failed: ${error.message}`,
        trustDecisions: {},
        finalVerdict: 'fail',
        scores: {},
        latency: Date.now() - startTime,
        tokensUsed: 0,
      };
    }
  }

  private buildPrompt(input: EscalationInput): string {
    let prompt = ESCALATION_META_PROMPT;

    prompt = prompt.replace('{query}', input.query);
    prompt = prompt.replace(
      '{content}',
      JSON.stringify(input.content, null, 2),
    );
    prompt = prompt.replace(
      '{panelResults}',
      this.formatPanelResults(input.panelResults),
    );
    prompt = prompt.replace('{trigger}', this.describeTrigger(input.trigger));

    return prompt;
  }

  private formatPanelResults(results: EvaluatorResult[]): string {
    return results
      .map(
        (r) => `
### ${r.role} (${r.model})
- Confidence: ${r.confidence}
- Scores: ${JSON.stringify(r.scores)}
- Critique: ${r.critique}
    `,
      )
      .join('\n');
  }

  private describeTrigger(trigger: string): string {
    const descriptions: Record<string, string> = {
      low_confidence: 'All evaluators reported low confidence (< 0.6)',
      disagreement:
        'Evaluators significantly disagreed (scores differ by > 0.3)',
      borderline:
        'Aggregated score is borderline (within 0.05 of pass threshold)',
    };
    return descriptions[trigger] || trigger;
  }

  private parseResponse(content: string): any {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { finalVerdict: 'fail', overallConfidence: 0.3 };
    } catch {
      return { finalVerdict: 'fail', overallConfidence: 0.3 };
    }
  }

  private flattenTrustDecisions(decisions: any): Record<string, number> {
    if (!decisions) return {};

    const flattened: Record<string, number> = {};
    for (const [role, data] of Object.entries(decisions)) {
      if (typeof data === 'object' && data !== null && 'trustScore' in data) {
        flattened[role] = (data as any).trustScore;
      }
    }
    return flattened;
  }
}
