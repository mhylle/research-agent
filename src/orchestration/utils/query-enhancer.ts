// src/orchestration/utils/query-enhancer.ts
/**
 * Query enhancement utilities for improving search query generation.
 * Handles language detection, date extraction, and query optimization.
 */

/**
 * Detects the language of a query using simple heuristics.
 *
 * @param query - The user query to analyze
 * @returns ISO 639-1 language code (e.g., 'da', 'en', 'sv', 'no', 'de', 'fr')
 */
export function detectLanguage(query: string): string {
  const lowercaseQuery = query.toLowerCase();

  // Danish indicators
  const danishWords = [
    'hvad',
    'hvor',
    'hvordan',
    'hvornår',
    'hvem',
    'sker',
    'der',
    'i dag',
    'morgen',
    'være',
    'kan',
    'vil',
    'skal',
    'og',
    'eller',
    'med',
  ];
  const danishCount = danishWords.filter((word) =>
    lowercaseQuery.includes(word),
  ).length;

  // Swedish indicators
  const swedishWords = [
    'vad',
    'var',
    'hur',
    'när',
    'vem',
    'händer',
    'idag',
    'imorgon',
    'vara',
    'kan',
    'vill',
    'ska',
    'och',
    'eller',
    'med',
  ];
  const swedishCount = swedishWords.filter((word) =>
    lowercaseQuery.includes(word),
  ).length;

  // Norwegian indicators
  const norwegianWords = [
    'hva',
    'hvor',
    'hvordan',
    'når',
    'hvem',
    'skjer',
    'i dag',
    'morgen',
    'være',
    'kan',
    'vil',
    'skal',
    'og',
    'eller',
    'med',
  ];
  const norwegianCount = norwegianWords.filter((word) =>
    lowercaseQuery.includes(word),
  ).length;

  // German indicators
  const germanWords = [
    'was',
    'wo',
    'wie',
    'wann',
    'wer',
    'passiert',
    'geschieht',
    'heute',
    'morgen',
    'sein',
    'kann',
    'wird',
    'soll',
    'und',
    'oder',
    'mit',
  ];
  const germanCount = germanWords.filter((word) =>
    lowercaseQuery.includes(word),
  ).length;

  // French indicators
  const frenchWords = [
    'quoi',
    'où',
    'comment',
    'quand',
    'qui',
    'passe',
    'arrive',
    "aujourd'hui",
    'demain',
    'être',
    'peut',
    'va',
    'doit',
    'et',
    'ou',
    'avec',
  ];
  const frenchCount = frenchWords.filter((word) =>
    lowercaseQuery.includes(word),
  ).length;

  // Find the language with the most matches
  const scores = {
    da: danishCount,
    sv: swedishCount,
    no: norwegianCount,
    de: germanCount,
    fr: frenchCount,
    en: 0, // Default fallback
  };

  const maxScore = Math.max(...Object.values(scores));

  // If we found strong language indicators (at least 2 matches), return that language
  if (maxScore >= 2) {
    return (
      Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] ||
      'en'
    );
  }

  // Default to English
  return 'en';
}

/**
 * Temporal pattern definitions for date extraction
 */
interface TemporalPattern {
  pattern: RegExp;
  extractor: (match: RegExpMatchArray, now: Date) => Date[];
}

/**
 * Extracts dates from temporal references in the query.
 * Converts relative dates (today, tomorrow, etc.) to absolute dates.
 *
 * @param query - The user query containing temporal references
 * @param language - The detected language code
 * @param currentDate - The current date (defaults to now)
 * @returns Array of extracted dates
 */
export function extractDates(
  query: string,
  language: string,
  currentDate: Date = new Date(),
): Date[] {
  const lowercaseQuery = query.toLowerCase();
  const dates: Date[] = [];

  // Helper function to add days to a date
  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Define temporal patterns per language
  const patterns: Record<string, TemporalPattern[]> = {
    // Danish patterns
    da: [
      {
        pattern: /i dag og i morgen/,
        extractor: (_, now) => [now, addDays(now, 1)],
      },
      {
        pattern: /i dag/,
        extractor: (_, now) => [now],
      },
      {
        pattern: /i morgen/,
        extractor: (_, now) => [addDays(now, 1)],
      },
      {
        pattern: /i weekenden/,
        extractor: (_, now) => {
          // Find next Saturday and Sunday
          const dayOfWeek = now.getDay();
          const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
          return [
            addDays(now, daysUntilSaturday),
            addDays(now, daysUntilSaturday + 1),
          ];
        },
      },
      {
        pattern: /næste uge/,
        extractor: (_, now) => [addDays(now, 7)],
      },
    ],

    // English patterns
    en: [
      {
        pattern: /today and tomorrow/,
        extractor: (_, now) => [now, addDays(now, 1)],
      },
      {
        pattern: /today/,
        extractor: (_, now) => [now],
      },
      {
        pattern: /tomorrow/,
        extractor: (_, now) => [addDays(now, 1)],
      },
      {
        pattern: /this weekend/,
        extractor: (_, now) => {
          const dayOfWeek = now.getDay();
          const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
          return [
            addDays(now, daysUntilSaturday),
            addDays(now, daysUntilSaturday + 1),
          ];
        },
      },
      {
        pattern: /next week/,
        extractor: (_, now) => [addDays(now, 7)],
      },
    ],

    // Swedish patterns
    sv: [
      {
        pattern: /idag och imorgon/,
        extractor: (_, now) => [now, addDays(now, 1)],
      },
      {
        pattern: /idag/,
        extractor: (_, now) => [now],
      },
      {
        pattern: /imorgon/,
        extractor: (_, now) => [addDays(now, 1)],
      },
      {
        pattern: /nästa helg/,
        extractor: (_, now) => {
          const dayOfWeek = now.getDay();
          const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
          return [
            addDays(now, daysUntilSaturday),
            addDays(now, daysUntilSaturday + 1),
          ];
        },
      },
      {
        pattern: /nästa vecka/,
        extractor: (_, now) => [addDays(now, 7)],
      },
    ],

    // Norwegian patterns
    no: [
      {
        pattern: /i dag og i morgen/,
        extractor: (_, now) => [now, addDays(now, 1)],
      },
      {
        pattern: /i dag/,
        extractor: (_, now) => [now],
      },
      {
        pattern: /i morgen/,
        extractor: (_, now) => [addDays(now, 1)],
      },
      {
        pattern: /neste helg/,
        extractor: (_, now) => {
          const dayOfWeek = now.getDay();
          const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
          return [
            addDays(now, daysUntilSaturday),
            addDays(now, daysUntilSaturday + 1),
          ];
        },
      },
      {
        pattern: /neste uke/,
        extractor: (_, now) => [addDays(now, 7)],
      },
    ],

    // German patterns
    de: [
      {
        pattern: /heute und morgen/,
        extractor: (_, now) => [now, addDays(now, 1)],
      },
      {
        pattern: /heute/,
        extractor: (_, now) => [now],
      },
      {
        pattern: /morgen/,
        extractor: (_, now) => [addDays(now, 1)],
      },
      {
        pattern: /nächstes wochenende/,
        extractor: (_, now) => {
          const dayOfWeek = now.getDay();
          const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
          return [
            addDays(now, daysUntilSaturday),
            addDays(now, daysUntilSaturday + 1),
          ];
        },
      },
      {
        pattern: /nächste woche/,
        extractor: (_, now) => [addDays(now, 7)],
      },
    ],

    // French patterns
    fr: [
      {
        pattern: /aujourd'hui et demain/,
        extractor: (_, now) => [now, addDays(now, 1)],
      },
      {
        pattern: /aujourd'hui/,
        extractor: (_, now) => [now],
      },
      {
        pattern: /demain/,
        extractor: (_, now) => [addDays(now, 1)],
      },
      {
        pattern: /ce week-end/,
        extractor: (_, now) => {
          const dayOfWeek = now.getDay();
          const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
          return [
            addDays(now, daysUntilSaturday),
            addDays(now, daysUntilSaturday + 1),
          ];
        },
      },
      {
        pattern: /la semaine prochaine/,
        extractor: (_, now) => [addDays(now, 7)],
      },
    ],
  };

  // Get patterns for the detected language, fallback to English
  const languagePatterns = patterns[language] || patterns['en'];

  // Try each pattern
  for (const { pattern, extractor } of languagePatterns) {
    const match = lowercaseQuery.match(pattern);
    if (match) {
      const extractedDates = extractor(match, currentDate);
      dates.push(...extractedDates);
      break; // Stop after first match to avoid duplicates
    }
  }

  return dates;
}

/**
 * Formats a date as YYYY-MM-DD
 *
 * @param date - The date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Builds an optimized search query with language and date awareness.
 *
 * @param baseQuery - The base search terms
 * @param location - Optional location to include
 * @param dates - Array of dates to include
 * @param language - The target language
 * @returns Optimized search query string
 */
export function buildSearchQuery(
  baseQuery: string,
  location?: string,
  dates?: Date[],
  language?: string,
): string {
  const parts: string[] = [];

  // Add base query
  parts.push(baseQuery);

  // Add location
  if (location) {
    parts.push(location);
  }

  // Add dates
  if (dates && dates.length > 0) {
    const dateStrings = dates.map(formatDate);
    if (dateStrings.length === 1) {
      parts.push(dateStrings[0]);
    } else {
      // Use OR for multiple dates
      parts.push(`(${dateStrings.join(' OR ')})`);
    }
  }

  return parts.join(' ');
}

/**
 * Analyzes a user query and provides query enhancement suggestions for the planner.
 *
 * @param query - The user query to analyze
 * @param currentDate - The current date (defaults to now)
 * @returns Query enhancement metadata
 */
export interface QueryEnhancementMetadata {
  detectedLanguage: string;
  extractedDates: Date[];
  formattedDates: string[];
  hasTemporalReference: boolean;
  suggestions: string[];
}

export function analyzeQuery(
  query: string,
  currentDate: Date = new Date(),
): QueryEnhancementMetadata {
  const language = detectLanguage(query);
  const dates = extractDates(query, language, currentDate);
  const formattedDates = dates.map(formatDate);

  const suggestions: string[] = [];

  // Add language suggestion
  suggestions.push(
    `Use ${language} language for search queries to match user's language`,
  );

  // Add date suggestions
  if (dates.length > 0) {
    suggestions.push(
      `Include specific dates: ${formattedDates.join(', ')} (converted from temporal references)`,
    );
  }

  // Add location suggestion if applicable
  const locationMatch = query.match(
    /\b(aarhus|københavn|odense|aalborg|esbjerg|copenhagen|stockholm|oslo|helsinki)\b/i,
  );
  if (locationMatch) {
    suggestions.push(`Include location: ${locationMatch[0]}`);
  }

  return {
    detectedLanguage: language,
    extractedDates: dates,
    formattedDates,
    hasTemporalReference: dates.length > 0,
    suggestions,
  };
}
