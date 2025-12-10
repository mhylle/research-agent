import { Injectable } from '@nestjs/common';

@Injectable()
export class ResearchSuggestionService {
  /**
   * Determines if a message should trigger a research suggestion
   * @param message The user's message
   * @returns true if research should be suggested
   */
  shouldSuggestResearch(message: string): boolean {
    if (!message || message.trim().length === 0) {
      return false;
    }

    const normalizedMessage = message.trim().toLowerCase();

    return (
      this.isFactualQuestion(normalizedMessage) ||
      this.hasTemporalAspect(normalizedMessage) ||
      this.mentionsExternalEntities(message)
    );
  }

  /**
   * Detects if the text starts with common question words
   * @param text The normalized (lowercase) text to analyze
   * @returns true if it's a factual question
   */
  private isFactualQuestion(text: string): boolean {
    const questionWords = [
      'who',
      'what',
      'when',
      'where',
      'why',
      'how',
      'which',
      'does',
      'is',
      'are',
      'was',
      'were',
      'can',
      'could',
      'will',
      'would',
    ];

    return questionWords.some((word) => text.startsWith(word + ' '));
  }

  /**
   * Detects temporal indicators suggesting current/recent information
   * @param text The normalized (lowercase) text to analyze
   * @returns true if temporal aspects are detected
   */
  private hasTemporalAspect(text: string): boolean {
    const temporalKeywords = [
      'latest',
      'recent',
      'current',
      'new',
      'updated',
      'today',
      'this year',
      '2024',
      '2025',
      '2026',
      '2027',
      '2028',
      '2029',
    ];

    return temporalKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Detects capitalized words that might be products/companies/technologies
   * Simple heuristic: looks for words with uppercase letters not at sentence start
   * @param text The original (non-normalized) text to analyze
   * @returns true if external entities are detected
   */
  private mentionsExternalEntities(text: string): boolean {
    // Split into sentences (basic approach)
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length === 0) continue;

      // Get all words except the first one
      const words = trimmed.split(/\s+/);
      const nonFirstWords = words.slice(1);

      // Check if any non-first word starts with uppercase
      // Ignore common articles/prepositions that might be capitalized
      const commonWords = new Set(['i', 'a', 'an', 'the', 'in', 'on', 'at']);

      for (const word of nonFirstWords) {
        // Remove punctuation for checking
        const cleanWord = word.replace(/[.,!?;:()]/g, '');
        if (cleanWord.length === 0) continue;

        const startsWithUpper = cleanWord[0] === cleanWord[0].toUpperCase();
        const isCommonWord = commonWords.has(cleanWord.toLowerCase());

        if (startsWithUpper && !isCommonWord) {
          return true;
        }
      }
    }

    return false;
  }
}
