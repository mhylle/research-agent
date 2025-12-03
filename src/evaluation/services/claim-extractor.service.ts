import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OllamaService } from '../../llm/ollama.service';
import { Claim, SubstantiveWord } from '../interfaces/claim.interface';

@Injectable()
export class ClaimExtractorService {
  private readonly logger = new Logger(ClaimExtractorService.name);

  constructor(private readonly ollamaService: OllamaService) {}

  /**
   * Extract discrete claims from answer text using LLM
   */
  async extractClaims(answerText: string): Promise<Claim[]> {
    this.logger.debug(
      `Extracting claims from answer (${answerText.length} chars)`,
    );

    const prompt = this.buildExtractionPrompt(answerText);

    try {
      const response = await this.ollamaService.chat([
        {
          role: 'system',
          content:
            'You are a claim extraction expert. Extract discrete factual claims from text and identify substantive words. Always respond with valid JSON only, no additional text.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const claims = this.parseClaimsResponse(
        response.message.content,
        answerText,
      );
      this.logger.debug(`Extracted ${claims.length} claims`);

      return claims;
    } catch (error) {
      this.logger.error(`Failed to extract claims: ${error.message}`);
      throw new Error(`Claim extraction failed: ${error.message}`);
    }
  }

  private buildExtractionPrompt(answerText: string): string {
    return `Extract all discrete claims from the following answer. For each claim:
1. Identify the claim text
2. Classify the claim type (factual, comparative, temporal, causal, opinion)
3. Extract substantive words (nouns, verbs, numerals, proper nouns)
4. Calculate importance scores (1.0 for proper nouns, 0.95 for numerals, 0.8 for nouns, 0.7 for verbs)
5. Note the character position of each word

Answer text:
"""
${answerText}
"""

Respond with ONLY a JSON array of claims in this exact format:
[
  {
    "text": "claim text here",
    "type": "factual",
    "substantiveWords": [
      {
        "word": "example",
        "type": "noun",
        "position": 10,
        "importance": 0.8
      }
    ],
    "sourceSpan": { "start": 0, "end": 50 }
  }
]`;
  }

  private parseClaimsResponse(
    responseContent: string,
    originalText: string,
  ): Claim[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn(
          'No JSON array found in response, attempting full parse',
        );
      }

      const jsonStr = jsonMatch ? jsonMatch[0] : responseContent;
      const parsedClaims = JSON.parse(jsonStr);

      if (!Array.isArray(parsedClaims)) {
        throw new Error('Response is not an array');
      }

      return parsedClaims
        .map((claim) => {
          // Validate required fields
          if (
            !claim.text ||
            !claim.type ||
            !Array.isArray(claim.substantiveWords)
          ) {
            this.logger.warn('Claim missing required fields, skipping:', claim);
            return null;
          }

          // Validate substantive words
          const validWords = claim.substantiveWords.filter((word: any) => {
            return (
              word.word &&
              word.type &&
              typeof word.position === 'number' &&
              typeof word.importance === 'number'
            );
          });

          // Auto-calculate sourceSpan if not provided
          const sourceSpan =
            claim.sourceSpan || this.findSourceSpan(claim.text, originalText);

          return {
            id: randomUUID(),
            text: claim.text,
            type: claim.type,
            substantiveWords: validWords,
            sourceSpan,
          } as Claim;
        })
        .filter((claim) => claim !== null);
    } catch (error) {
      this.logger.error(`Failed to parse claims response: ${error.message}`);
      this.logger.debug(`Response content: ${responseContent}`);

      // Fallback: create a single claim from the entire answer
      this.logger.warn('Falling back to single claim extraction');
      return this.createFallbackClaim(originalText);
    }
  }

  private findSourceSpan(
    claimText: string,
    originalText: string,
  ): { start: number; end: number } {
    const start = originalText.indexOf(claimText);
    if (start !== -1) {
      return { start, end: start + claimText.length };
    }
    // If exact match not found, return full text span
    return { start: 0, end: originalText.length };
  }

  private createFallbackClaim(text: string): Claim[] {
    this.logger.warn('Creating fallback claim from entire text');

    return [
      {
        id: randomUUID(),
        text: text.substring(0, 500), // First 500 chars
        type: 'factual',
        substantiveWords: [],
        sourceSpan: { start: 0, end: Math.min(500, text.length) },
      },
    ];
  }
}
