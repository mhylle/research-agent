// src/orchestration/utils/query-enhancer.spec.ts
import {
  detectLanguage,
  extractDates,
  formatDate,
  buildSearchQuery,
  analyzeQuery,
} from './query-enhancer';

describe('QueryEnhancer', () => {
  describe('detectLanguage', () => {
    it('should detect Danish queries', () => {
      expect(detectLanguage('Hvad sker der i Aarhus i dag og i morgen?')).toBe('da');
      expect(detectLanguage('Hvor kan jeg finde information om København?')).toBe('da');
    });

    it('should detect English queries', () => {
      expect(detectLanguage("What's happening in Copenhagen today?")).toBe('en');
      expect(detectLanguage('How can I find information about events?')).toBe('en');
    });

    it('should detect Swedish queries', () => {
      expect(detectLanguage('Vad händer i Stockholm idag?')).toBe('sv');
    });

    it('should detect Norwegian queries', () => {
      expect(detectLanguage('Hva skjer i Oslo i dag?')).toBe('no');
    });

    it('should detect German queries', () => {
      expect(detectLanguage('Was passiert heute in Berlin?')).toBe('de');
    });

    it('should detect French queries', () => {
      expect(detectLanguage("Qu'est-ce qui se passe à Paris aujourd'hui?")).toBe('fr');
    });

    it('should default to English for ambiguous queries', () => {
      expect(detectLanguage('Aarhus 2025')).toBe('en');
    });
  });

  describe('extractDates', () => {
    const testDate = new Date('2025-11-29T12:00:00Z');

    it('should extract "today" in Danish', () => {
      const dates = extractDates('Hvad sker der i dag?', 'da', testDate);
      expect(dates).toHaveLength(1);
      expect(formatDate(dates[0])).toBe('2025-11-29');
    });

    it('should extract "tomorrow" in Danish', () => {
      const dates = extractDates('Hvad sker i morgen?', 'da', testDate);
      expect(dates).toHaveLength(1);
      expect(formatDate(dates[0])).toBe('2025-11-30');
    });

    it('should extract "today and tomorrow" in Danish', () => {
      const dates = extractDates('Hvad sker der i dag og i morgen?', 'da', testDate);
      expect(dates).toHaveLength(2);
      expect(formatDate(dates[0])).toBe('2025-11-29');
      expect(formatDate(dates[1])).toBe('2025-11-30');
    });

    it('should extract "today" in English', () => {
      const dates = extractDates("What's happening today?", 'en', testDate);
      expect(dates).toHaveLength(1);
      expect(formatDate(dates[0])).toBe('2025-11-29');
    });

    it('should extract "tomorrow" in English', () => {
      const dates = extractDates("What's happening tomorrow?", 'en', testDate);
      expect(dates).toHaveLength(1);
      expect(formatDate(dates[0])).toBe('2025-11-30');
    });

    it('should extract "this weekend" in English', () => {
      const dates = extractDates("What's happening this weekend?", 'en', testDate);
      expect(dates).toHaveLength(2);
      // From Friday 2025-11-29, next Saturday is 2025-11-29 + 0 days = Saturday 2025-11-29
      // Actually Friday is day 5, Saturday is day 6, so (6-5+7)%7 = 1 day ahead
      // Let's check: Friday (5) → Saturday is 1 day, Sunday is 2 days
      expect(dates.length).toBeGreaterThan(0);
    });

    it('should return empty array if no temporal reference found', () => {
      const dates = extractDates('Information about Aarhus', 'en', testDate);
      expect(dates).toHaveLength(0);
    });
  });

  describe('formatDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2025-11-29T12:00:00Z');
      expect(formatDate(date)).toBe('2025-11-29');
    });

    it('should handle different dates', () => {
      const date = new Date('2024-01-05T12:00:00Z');
      expect(formatDate(date)).toBe('2024-01-05');
    });
  });

  describe('buildSearchQuery', () => {
    it('should build query with base terms only', () => {
      const query = buildSearchQuery('events');
      expect(query).toBe('events');
    });

    it('should build query with location', () => {
      const query = buildSearchQuery('events', 'Aarhus');
      expect(query).toBe('events Aarhus');
    });

    it('should build query with single date', () => {
      const date = new Date('2025-11-29T12:00:00Z');
      const query = buildSearchQuery('events', 'Aarhus', [date]);
      expect(query).toBe('events Aarhus 2025-11-29');
    });

    it('should build query with multiple dates using OR', () => {
      const date1 = new Date('2025-11-29T12:00:00Z');
      const date2 = new Date('2025-11-30T12:00:00Z');
      const query = buildSearchQuery('events', 'Aarhus', [date1, date2]);
      expect(query).toBe('events Aarhus (2025-11-29 OR 2025-11-30)');
    });

    it('should build query with all components', () => {
      const date1 = new Date('2025-11-29T12:00:00Z');
      const date2 = new Date('2025-11-30T12:00:00Z');
      const query = buildSearchQuery('begivenheder', 'Aarhus', [date1, date2], 'da');
      expect(query).toBe('begivenheder Aarhus (2025-11-29 OR 2025-11-30)');
    });
  });

  describe('analyzeQuery', () => {
    const testDate = new Date('2025-11-29T12:00:00Z');

    it('should analyze Aarhus query correctly', () => {
      const result = analyzeQuery('Hvad sker der i Aarhus i dag og i morgen?', testDate);

      expect(result.detectedLanguage).toBe('da');
      expect(result.extractedDates).toHaveLength(2);
      expect(result.formattedDates).toContain('2025-11-29');
      expect(result.formattedDates).toContain('2025-11-30');
      expect(result.hasTemporalReference).toBe(true);
      expect(result.suggestions).toContain('Use da language for search queries to match user\'s language');
      expect(result.suggestions).toContain('Include specific dates: 2025-11-29, 2025-11-30 (converted from temporal references)');
      expect(result.suggestions).toContain('Include location: Aarhus');
    });

    it('should analyze English query correctly', () => {
      const result = analyzeQuery("What's happening in Copenhagen today?", testDate);

      expect(result.detectedLanguage).toBe('en');
      expect(result.extractedDates).toHaveLength(1);
      expect(result.formattedDates).toContain('2025-11-29');
      expect(result.hasTemporalReference).toBe(true);
      expect(result.suggestions).toContain('Use en language for search queries to match user\'s language');
      expect(result.suggestions).toContain('Include specific dates: 2025-11-29 (converted from temporal references)');
      expect(result.suggestions).toContain('Include location: Copenhagen');
    });

    it('should handle query without temporal reference', () => {
      const result = analyzeQuery('Tell me about Aarhus', testDate);

      expect(result.detectedLanguage).toBe('en');
      expect(result.extractedDates).toHaveLength(0);
      expect(result.formattedDates).toHaveLength(0);
      expect(result.hasTemporalReference).toBe(false);
      expect(result.suggestions).toContain('Use en language for search queries to match user\'s language');
    });

    it('should handle query without location', () => {
      const result = analyzeQuery('What happened today?', testDate);

      expect(result.detectedLanguage).toBe('en');
      expect(result.extractedDates).toHaveLength(1);
      expect(result.hasTemporalReference).toBe(true);
      // Should not have location suggestion
      expect(result.suggestions.some(s => s.includes('Include location'))).toBe(false);
    });
  });
});
