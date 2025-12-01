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
    context: {
      query: string;
      plan: any;
      searchQueries?: string[];
      sources?: string;
      answer?: string;
    },
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
      this.logger.debug(
        `[evaluateWithRole] ${role} result - explanation: "${result.explanation?.substring(0, 100)}...", scores: ${JSON.stringify(result.scores)}`,
      );

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
    context: {
      query: string;
      plan: any;
      searchQueries?: string[];
      sources?: string;
      answer?: string;
    },
  ): Promise<EvaluatorResult[]> {
    console.log(
      `[PanelEvaluatorService] evaluateWithPanel called with roles:`,
      roles,
    );
    console.log(`[PanelEvaluatorService] Context query:`, context.query);

    const evaluations = roles.map((role) =>
      this.evaluateWithRole(role, context),
    );
    const results = await Promise.all(evaluations);

    console.log(
      `[PanelEvaluatorService] Panel evaluation completed, ${results.length} results`,
    );
    return results;
  }

  private buildPrompt(
    role: EvaluatorRole,
    context: {
      query: string;
      plan: any;
      searchQueries?: string[];
      sources?: string;
      answer?: string;
    },
  ): string {
    let template = this.prompts[role];

    // Inject current date and year for temporal awareness
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentYear = now.getFullYear().toString();

    template = template.replace('{currentDate}', currentDate);
    template = template.replace('{currentYear}', currentYear);

    template = template.replace('{query}', context.query);
    template = template.replace(
      '{plan}',
      JSON.stringify(context.plan, null, 2),
    );

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
      this.logger.debug(
        `[parseResponse] Raw content: ${content.substring(0, 500)}...`,
      );

      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // Strip comments, remove trailing commas, and sanitize JSON string before parsing
        const commentStripped = this.stripJsonComments(jsonMatch[0]);
        const trailingCommasRemoved = this.removeTrailingCommas(commentStripped);
        const sanitizedJson = this.sanitizeJsonString(trailingCommasRemoved);
        const parsed = JSON.parse(sanitizedJson);

        // Log what we parsed to debug missing explanations and score precision
        this.logger.debug(
          `[parseResponse] Parsed JSON: ${JSON.stringify(parsed, null, 2)}`,
        );

        // Check if scores need to be converted from 0-10 scale to 0-1 scale
        if (parsed.scores) {
          for (const [key, value] of Object.entries(parsed.scores)) {
            if (typeof value === 'number' && value > 1) {
              this.logger.warn(
                `[parseResponse] Score ${key} is ${value}, converting from 0-10 to 0-1 scale`,
              );
              parsed.scores[key] = value / 10;
            }
          }
        }

        return parsed;
      }
      return { confidence: 0.3, critique: 'Could not parse response' };
    } catch (error) {
      this.logger.error(`[parseResponse] Parse error: ${error.message}`);
      this.logger.debug(`[parseResponse] Failed content: ${content}`);
      return { confidence: 0.3, critique: 'Invalid JSON response' };
    }
  }

  /**
   * Strip JavaScript-style comments from JSON string that LLMs sometimes include.
   * Handles both single-line (//) and multi-line (/* *\/) comments, but only
   * outside of string values to preserve URLs like "https://example.com".
   */
  private stripJsonComments(str: string): string {
    let result = '';
    let inString = false;
    let i = 0;

    while (i < str.length) {
      // Track string boundaries (but not escaped quotes)
      if (str[i] === '"' && (i === 0 || str[i - 1] !== '\\')) {
        inString = !inString;
        result += str[i];
        i++;
        continue;
      }

      // Skip comments only outside strings
      if (!inString) {
        // Single-line comment
        if (str[i] === '/' && str[i + 1] === '/') {
          while (i < str.length && str[i] !== '\n') i++;
          continue;
        }
        // Multi-line comment
        if (str[i] === '/' && str[i + 1] === '*') {
          i += 2;
          while (
            i < str.length - 1 &&
            !(str[i] === '*' && str[i + 1] === '/')
          ) {
            i++;
          }
          i += 2;
          continue;
        }
      }

      result += str[i];
      i++;
    }

    return result;
  }

  /**
   * Remove trailing commas from JSON string that LLMs sometimes include.
   * Handles commas before closing braces } and brackets ].
   */
  private removeTrailingCommas(str: string): string {
    // Remove trailing commas before } or ]
    return str
      .replace(/,(\s*})/g, '$1')  // Remove , before }
      .replace(/,(\s*\])/g, '$1'); // Remove , before ]
  }

  /**
   * Sanitize JSON string to handle control characters and malformed content from LLM responses.
   * This method handles two types of control characters:
   * 1. Unescaped control characters inside string values (need to be escaped)
   * 2. Control characters that are part of JSON formatting (should be preserved)
   */
  private sanitizeJsonString(jsonStr: string): string {
    try {
      let result = '';
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        const charCode = char.charCodeAt(0);

        // Track if we're inside a string value
        if (char === '"' && !escapeNext) {
          inString = !inString;
          result += char;
          continue;
        }

        // Track escape sequences
        if (char === '\\' && !escapeNext) {
          escapeNext = true;
          result += char;
          continue;
        }

        if (escapeNext) {
          escapeNext = false;
          result += char;
          continue;
        }

        // If we're inside a string and encounter a control character, escape it
        if (inString && charCode >= 0x00 && charCode <= 0x1f) {
          const escapes: Record<string, string> = {
            '\n': '\\n',
            '\r': '\\r',
            '\t': '\\t',
            '\b': '\\b',
            '\f': '\\f',
          };
          result += escapes[char] || '';
        } else {
          result += char;
        }
      }

      return result;
    } catch (error) {
      this.logger.warn(
        `[sanitizeJsonString] Sanitization failed: ${error.message}`,
      );
      return jsonStr;
    }
  }
}
