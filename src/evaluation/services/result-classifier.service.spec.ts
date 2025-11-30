import { Test, TestingModule } from '@nestjs/testing';
import {
  ResultClassifierService,
  ResultType,
} from './result-classifier.service';

describe('ResultClassifierService', () => {
  let service: ResultClassifierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResultClassifierService],
    }).compile();

    service = module.get<ResultClassifierService>(ResultClassifierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('classify', () => {
    it('should classify Eventbrite listing as AGGREGATOR with low actionable score', () => {
      const input = {
        url: 'https://www.eventbrite.com/d/denmark--århus/events--today/',
        title: 'All Events in Aarhus - Today',
        content: `
          Find events in Aarhus today
          Browse upcoming events
          See all events
          Event 1: Read more
          Event 2: Read more
          Event 3: Read more
          https://example.com/event1
          https://example.com/event2
          https://example.com/event3
        `,
      };

      const result = service.classify(input);

      expect(result.type).toBe(ResultType.AGGREGATOR);
      expect(result.actionableInformationScore).toBeLessThan(0.3);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should classify specific event page as SPECIFIC_CONTENT with high actionable score', () => {
      const input = {
        url: 'https://example.com/events/jazz-concert-nov-29-2024',
        title: 'Jazz Concert at Blue Note - November 29',
        content: `
          Jazz Concert featuring Miles Davis Tribute Band
          Date: November 29, 2024
          Time: 8:00 PM
          Venue: Blue Note Jazz Club
          Location: 123 Music Street, Aarhus
          Price: $25

          Description: Experience an evening of classic jazz...
        `,
      };

      const result = service.classify(input);

      expect(result.type).toBe(ResultType.SPECIFIC_CONTENT);
      expect(result.actionableInformationScore).toBeGreaterThan(0.8);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify allevents.in listing as AGGREGATOR', () => {
      const input = {
        url: 'https://allevents.in/aarhus/all',
        title: 'All Events in Aarhus - Find Events',
        content: `
          Find all events in Aarhus
          Upcoming events
          Browse by category
          See more events
          Event listings
          https://allevents.in/event1
          https://allevents.in/event2
          Read more Read more Read more
        `,
      };

      const result = service.classify(input);

      expect(result.type).toBe(ResultType.AGGREGATOR);
      expect(result.actionableInformationScore).toBeLessThan(0.4);
    });

    it('should detect specific event with date and time', () => {
      const input = {
        url: 'https://venue.com/concerts/2024/rock-show',
        title: 'Rock Concert 2024',
        content: `
          Rock Concert
          When: Dec 15, 2024 at 7:30 PM
          Where: Arena Hall, 456 Concert Ave
          Tickets: $40
        `,
      };

      const result = service.classify(input);

      expect(result.type).toBe(ResultType.SPECIFIC_CONTENT);
      expect(result.actionableInformationScore).toBeGreaterThan(0.7);
    });

    it('should classify navigation page with moderate score', () => {
      const input = {
        url: 'https://example.com/culture',
        title: 'Culture & Events',
        content: `
          Welcome to our culture section
          Explore different categories
          Arts, Music, Theater
        `,
      };

      const result = service.classify(input);

      expect(result.type).toBe(ResultType.NAVIGATION);
      expect(result.actionableInformationScore).toBeGreaterThanOrEqual(0.3);
      expect(result.actionableInformationScore).toBeLessThanOrEqual(0.5);
    });

    it('should handle missing title gracefully', () => {
      const input = {
        url: 'https://example.com/events',
        content: 'Some event content',
      };

      const result = service.classify(input);

      expect(result).toBeDefined();
      expect(result.type).toBeDefined();
      expect(result.actionableInformationScore).toBeGreaterThanOrEqual(0);
      expect(result.actionableInformationScore).toBeLessThanOrEqual(1);
    });

    it('should detect high link density in aggregator pages', () => {
      const input = {
        url: 'https://example.com/browse',
        title: 'Browse Events',
        content: `
          https://example.com/event1
          https://example.com/event2
          https://example.com/event3
          https://example.com/event4
          https://example.com/event5
          Read more Read more Read more
          Learn more Learn more Learn more
        `,
      };

      const result = service.classify(input);

      expect(result.type).toBe(ResultType.AGGREGATOR);
      expect(result.reasons).toContain('High link density suggests listing page');
    });
  });

  describe('classifyBatch', () => {
    it('should classify multiple results', () => {
      const inputs = [
        {
          url: 'https://eventbrite.com/search',
          title: 'Browse All Events',
          content: `Event 1, Event 2, Event 3
            https://example.com/1
            https://example.com/2
            Read more Read more`,
        },
        {
          url: 'https://example.com/events/concert',
          title: 'Concert Night',
          content: 'Date: Nov 29, Time: 8 PM, Venue: Hall',
        },
      ];

      const results = service.classifyBatch(inputs);

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe(ResultType.AGGREGATOR);
      expect(results[1].type).toBe(ResultType.SPECIFIC_CONTENT);
    });
  });

  describe('getAggregateStats', () => {
    it('should calculate aggregate statistics correctly', () => {
      const classifications = [
        {
          type: ResultType.AGGREGATOR,
          actionableInformationScore: 0.2,
          confidence: 0.8,
          reasons: [],
        },
        {
          type: ResultType.AGGREGATOR,
          actionableInformationScore: 0.3,
          confidence: 0.9,
          reasons: [],
        },
        {
          type: ResultType.SPECIFIC_CONTENT,
          actionableInformationScore: 0.9,
          confidence: 0.85,
          reasons: [],
        },
      ];

      const stats = service.getAggregateStats(classifications);

      expect(stats.aggregatorCount).toBe(2);
      expect(stats.specificContentCount).toBe(1);
      expect(stats.averageActionableScore).toBeCloseTo(0.467, 1);
      expect(stats.overallConfidence).toBeCloseTo(0.85, 1);
      expect(stats.needsExtraction).toBe(true); // Score < 0.6 and majority aggregators
    });

    it('should not suggest extraction for good specific content', () => {
      const classifications = [
        {
          type: ResultType.SPECIFIC_CONTENT,
          actionableInformationScore: 0.9,
          confidence: 0.9,
          reasons: [],
        },
        {
          type: ResultType.SPECIFIC_CONTENT,
          actionableInformationScore: 0.85,
          confidence: 0.85,
          reasons: [],
        },
      ];

      const stats = service.getAggregateStats(classifications);

      expect(stats.needsExtraction).toBe(false);
      expect(stats.averageActionableScore).toBeGreaterThan(0.6);
    });

    it('should suggest extraction when all results are aggregators', () => {
      const classifications = [
        {
          type: ResultType.AGGREGATOR,
          actionableInformationScore: 0.2,
          confidence: 0.8,
          reasons: [],
        },
        {
          type: ResultType.AGGREGATOR,
          actionableInformationScore: 0.1,
          confidence: 0.9,
          reasons: [],
        },
        {
          type: ResultType.AGGREGATOR,
          actionableInformationScore: 0.15,
          confidence: 0.85,
          reasons: [],
        },
      ];

      const stats = service.getAggregateStats(classifications);

      expect(stats.aggregatorCount).toBe(3);
      expect(stats.needsExtraction).toBe(true);
      expect(stats.averageActionableScore).toBeLessThan(0.6);
    });
  });
});
