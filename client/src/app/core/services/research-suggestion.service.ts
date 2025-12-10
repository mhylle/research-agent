import { Injectable } from '@angular/core';

/**
 * Service for detecting when a user message should trigger a research suggestion.
 * Mirrors backend detection logic for immediate UI feedback.
 */
@Injectable({
  providedIn: 'root'
})
export class ResearchSuggestionService {
  private readonly FACTUAL_QUESTION_STARTERS = [
    'who', 'what', 'when', 'where', 'why', 'how', 'which',
    'does', 'is', 'are', 'was', 'were',
    'can', 'could', 'will', 'would'
  ];

  private readonly TEMPORAL_KEYWORDS = [
    'latest', 'recent', 'current', 'new', 'updated',
    'today', 'this year', '2024', '2025', '2026', '2027', '2028', '2029'
  ];

  private readonly RESEARCH_RECOMMENDATION_PATTERN = /\[Research recommended\]/i;

  /**
   * Main detection method - returns true if any detection pattern matches
   */
  shouldSuggestResearch(message: string): boolean {
    if (!message || message.trim().length === 0) {
      return false;
    }

    return this.isFactualQuestion(message) ||
           this.hasTemporalAspect(message) ||
           this.mentionsExternalEntities(message);
  }

  /**
   * Detects factual questions by checking if message starts with common question words
   */
  isFactualQuestion(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    return this.FACTUAL_QUESTION_STARTERS.some(starter =>
      normalized.startsWith(starter + ' ')
    );
  }

  /**
   * Detects temporal aspects indicating recency or currency requirements
   */
  hasTemporalAspect(text: string): boolean {
    const normalized = text.toLowerCase();
    return this.TEMPORAL_KEYWORDS.some(keyword =>
      normalized.includes(keyword)
    );
  }

  /**
   * Detects mentions of external entities (capitalized words not at sentence start)
   */
  mentionsExternalEntities(text: string): boolean {
    // Split into sentences
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);

    for (const sentence of sentences) {
      const words = sentence.split(/\s+/);

      // Skip first word of each sentence (legitimate capitalization)
      for (let i = 1; i < words.length; i++) {
        const word = words[i];

        // Check if word starts with capital letter and has at least 2 characters
        if (word.length >= 2 && /^[A-Z]/.test(word) && /^[A-Za-z]+$/.test(word)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detects if LLM response contains research recommendation marker
   */
  containsResearchRecommendation(text: string): boolean {
    return this.RESEARCH_RECOMMENDATION_PATTERN.test(text);
  }
}
