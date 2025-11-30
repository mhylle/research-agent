import { Injectable, Logger } from '@nestjs/common';

export enum ResultType {
  SPECIFIC_CONTENT = 'SPECIFIC_CONTENT', // Actual events, articles, specific information
  AGGREGATOR = 'AGGREGATOR', // Event listings, search results, directory pages
  NAVIGATION = 'NAVIGATION', // Homepage, category pages, "find more" pages
}

export interface ResultClassification {
  type: ResultType;
  actionableInformationScore: number;
  confidence: number;
  reasons: string[];
}

export interface ClassificationInput {
  url: string;
  content: string;
  title?: string;
}

@Injectable()
export class ResultClassifierService {
  private readonly logger = new Logger(ResultClassifierService.name);

  // URL patterns that indicate aggregator pages
  private readonly AGGREGATOR_URL_PATTERNS = [
    /search/i,
    /events?(?!\/[a-z0-9-]+$)/i, // "events" but not "events/specific-slug"
    /all[-_]events/i,
    /category/i,
    /listings?/i,
    /browse/i,
    /directory/i,
    /find/i,
    /discover/i,
    /explore/i,
  ];

  // Title patterns that indicate aggregator pages
  private readonly AGGREGATOR_TITLE_PATTERNS = [
    /all events/i,
    /find events/i,
    /browse events/i,
    /event listings/i,
    /upcoming events/i,
    /search results/i,
    /events in/i,
    /events near/i,
  ];

  // Indicators of specific content
  private readonly SPECIFIC_CONTENT_INDICATORS = {
    datePatterns: [
      /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/, // Date formats
      /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i, // "Nov 29"
      /\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i, // "29 Nov"
    ],
    timePatterns: [
      /\d{1,2}:\d{2}\s*(?:am|pm)?/i, // Time formats
      /\d{1,2}\s*(?:am|pm)/i,
    ],
    locationPatterns: [
      /(?:at|venue|location):\s*[\w\s]+/i,
      /\d+\s+[\w\s]+(?:street|road|avenue|boulevard|lane)/i, // Street addresses
    ],
    pricePatterns: [
      /(?:price|cost|fee|ticket):\s*\$?\d+/i,
      /\$\d+(?:\.\d{2})?/,
      /free\s+(?:entry|admission)/i,
    ],
  };

  /**
   * Classify a single result
   */
  classify(input: ClassificationInput): ResultClassification {
    const { url, content, title } = input;

    // Step 1: Check URL patterns
    const urlScore = this.analyzeUrl(url);

    // Step 2: Check title patterns
    const titleScore = this.analyzeTitle(title);

    // Step 3: Analyze content structure
    const contentScore = this.analyzeContent(content);

    // Step 4: Calculate link density
    const linkDensity = this.calculateLinkDensity(content);

    // Step 5: Check for specific content indicators
    const specificityScore = this.calculateSpecificityScore(content);

    // Combine scores to determine type
    const aggregatorIndicators = urlScore + titleScore + linkDensity;
    const specificContentIndicators = contentScore + specificityScore;

    let type: ResultType;
    let actionableInformationScore: number;
    let confidence: number;
    const reasons: string[] = [];

    if (aggregatorIndicators > 1.5) {
      type = ResultType.AGGREGATOR;
      actionableInformationScore = Math.max(
        0,
        0.3 - aggregatorIndicators * 0.1,
      );
      confidence = Math.min(0.95, 0.7 + aggregatorIndicators * 0.1);
      reasons.push('URL/title patterns indicate aggregator page');
      if (linkDensity > 0.5) {
        reasons.push('High link density suggests listing page');
      }
    } else if (specificContentIndicators > 1.2) {
      type = ResultType.SPECIFIC_CONTENT;
      actionableInformationScore = Math.min(
        1.0,
        0.6 + specificContentIndicators * 0.2,
      );
      confidence = Math.min(0.95, 0.7 + specificContentIndicators * 0.1);
      reasons.push(
        'Content contains specific details (dates, times, locations)',
      );
    } else {
      // Navigation or unclear
      type = ResultType.NAVIGATION;
      actionableInformationScore = 0.4;
      confidence = 0.5;
      reasons.push(
        'Unclear page type, appears to be navigation or general page',
      );
    }

    this.logger.debug(
      `Classified ${url.substring(0, 50)} as ${type} (score: ${actionableInformationScore.toFixed(2)}, confidence: ${confidence.toFixed(2)})`,
    );

    return {
      type,
      actionableInformationScore,
      confidence,
      reasons,
    };
  }

  /**
   * Classify multiple results
   */
  classifyBatch(inputs: ClassificationInput[]): ResultClassification[] {
    return inputs.map((input) => this.classify(input));
  }

  /**
   * Analyze URL for aggregator patterns
   * Returns score: 0 (not aggregator) to 1 (definitely aggregator)
   */
  private analyzeUrl(url: string): number {
    let score = 0;
    for (const pattern of this.AGGREGATOR_URL_PATTERNS) {
      if (pattern.test(url)) {
        score += 0.5;
      }
    }
    return Math.min(1, score);
  }

  /**
   * Analyze title for aggregator patterns
   * Returns score: 0 (not aggregator) to 1 (definitely aggregator)
   */
  private analyzeTitle(title: string | undefined): number {
    if (!title) return 0;

    let score = 0;
    for (const pattern of this.AGGREGATOR_TITLE_PATTERNS) {
      if (pattern.test(title)) {
        score += 0.5;
      }
    }
    return Math.min(1, score);
  }

  /**
   * Analyze content structure
   * Returns score: 0 (no specific content) to 1 (lots of specific content)
   */
  private analyzeContent(content: string): number {
    // Check for multiple event markers
    const eventMarkers = content.match(/\bevent\b/gi) || [];
    const markerDensity =
      eventMarkers.length / Math.max(1, content.length / 100);

    // Too many "event" mentions suggests listing page
    if (markerDensity > 5) {
      return 0.2; // Likely a listing
    }

    // Moderate density suggests specific event
    if (markerDensity > 1 && markerDensity <= 5) {
      return 0.7;
    }

    return 0.5;
  }

  /**
   * Calculate link density in content
   * Returns score: 0 (few links) to 1 (mostly links)
   */
  private calculateLinkDensity(content: string): number {
    // Count URL patterns and link indicators
    const urlMatches = content.match(/https?:\/\/[^\s]+/g) || [];
    const linkMatches =
      content.match(/(?:read more|learn more|view event|see details)/gi) || [];

    const totalLinks = urlMatches.length + linkMatches.length;
    const contentLength = content.length;

    // High link density relative to content suggests aggregator
    const density = totalLinks / Math.max(1, contentLength / 200);

    return Math.min(1, density);
  }

  /**
   * Calculate specificity score based on presence of concrete details
   * Returns score: 0 (no details) to 1 (many specific details)
   */
  private calculateSpecificityScore(content: string): number {
    let score = 0;

    // Check for dates
    for (const pattern of this.SPECIFIC_CONTENT_INDICATORS.datePatterns) {
      if (pattern.test(content)) {
        score += 0.3;
        break;
      }
    }

    // Check for times
    for (const pattern of this.SPECIFIC_CONTENT_INDICATORS.timePatterns) {
      if (pattern.test(content)) {
        score += 0.25;
        break;
      }
    }

    // Check for locations
    for (const pattern of this.SPECIFIC_CONTENT_INDICATORS.locationPatterns) {
      if (pattern.test(content)) {
        score += 0.25;
        break;
      }
    }

    // Check for prices
    for (const pattern of this.SPECIFIC_CONTENT_INDICATORS.pricePatterns) {
      if (pattern.test(content)) {
        score += 0.2;
        break;
      }
    }

    return Math.min(1, score);
  }

  /**
   * Get aggregated classification statistics for a batch of results
   */
  getAggregateStats(classifications: ResultClassification[]): {
    averageActionableScore: number;
    aggregatorCount: number;
    specificContentCount: number;
    navigationCount: number;
    overallConfidence: number;
    needsExtraction: boolean;
  } {
    const totalScore = classifications.reduce(
      (sum, c) => sum + c.actionableInformationScore,
      0,
    );
    const totalConfidence = classifications.reduce(
      (sum, c) => sum + c.confidence,
      0,
    );

    const aggregatorCount = classifications.filter(
      (c) => c.type === ResultType.AGGREGATOR,
    ).length;
    const specificContentCount = classifications.filter(
      (c) => c.type === ResultType.SPECIFIC_CONTENT,
    ).length;
    const navigationCount = classifications.filter(
      (c) => c.type === ResultType.NAVIGATION,
    ).length;

    const averageActionableScore = totalScore / classifications.length;
    const overallConfidence = totalConfidence / classifications.length;

    // Suggest extraction if most results are aggregators and score is low
    const needsExtraction =
      averageActionableScore < 0.6 &&
      aggregatorCount > classifications.length / 2;

    return {
      averageActionableScore,
      aggregatorCount,
      specificContentCount,
      navigationCount,
      overallConfidence,
      needsExtraction,
    };
  }
}
