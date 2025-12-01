import { Test, TestingModule } from '@nestjs/testing';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { OllamaService } from '../../llm/ollama.service';

describe('PanelEvaluatorService', () => {
  let service: PanelEvaluatorService;
  let mockOllamaService: any;

  beforeEach(async () => {
    mockOllamaService = {
      chat: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PanelEvaluatorService,
        {
          provide: OllamaService,
          useValue: mockOllamaService,
        },
      ],
    }).compile();

    service = module.get<PanelEvaluatorService>(PanelEvaluatorService);
  });

  describe('evaluateWithRole', () => {
    it('should call LLM and parse JSON response', async () => {
      const mockResponse = {
        message: {
          content: JSON.stringify({
            scores: { intentAlignment: 0.85 },
            confidence: 0.9,
            critique: 'Good alignment',
          }),
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test query',
        plan: {},
      });

      expect(result.scores.intentAlignment).toBe(0.85);
      expect(result.confidence).toBe(0.9);
      expect(result.role).toBe('intentAnalyst');
    });

    it('should return low confidence on parse error', async () => {
      mockOllamaService.chat.mockResolvedValue({
        message: { content: 'not valid json' },
      });

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle control characters in JSON strings', async () => {
      // Simulate LLM response with newlines in string values
      const mockResponse = {
        message: {
          content: `{
            "scores": {"intentAlignment": 0.85},
            "confidence": 0.9,
            "explanation": "This is a multi-line
explanation with newlines
and tabs\there",
            "critique": "Good alignment"
          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test query',
        plan: {},
      });

      expect(result.scores.intentAlignment).toBe(0.85);
      expect(result.confidence).toBe(0.9);
      expect(result.explanation).toBeDefined();
      expect(result.explanation).toContain('multi-line');
    });

    it('should handle various control characters', async () => {
      // Test with various control characters that might appear in LLM responses
      const mockResponse = {
        message: {
          content:
            '{"scores": {"test": 0.8}, "confidence": 0.9, "critique": "Line1\nLine2\rLine3\tTabbed"}',
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.test).toBe(0.8);
      expect(result.confidence).toBe(0.9);
      expect(result.critique).toBeDefined();
    });

    it('should handle backspace and form feed characters', async () => {
      const mockResponse = {
        message: {
          content:
            '{"scores": {"test": 0.7}, "confidence": 0.8, "critique": "Text\bwith\fspecial"}',
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.test).toBe(0.7);
      expect(result.confidence).toBe(0.8);
    });

    it('should strip single-line JavaScript comments', async () => {
      const mockResponse = {
        message: {
          content: `{
            "scores": {"test": 0.8}, // This is a comment
            "confidence": 0.9, // Another comment
            "critique": "Good"
          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.test).toBe(0.8);
      expect(result.confidence).toBe(0.9);
      expect(result.critique).toBe('Good');
    });

    it('should strip multi-line JavaScript comments', async () => {
      const mockResponse = {
        message: {
          content: `{
            "scores": {"test": 0.8}, /* This is a
            multi-line comment */
            "confidence": 0.9,
            "critique": "Good" /* inline comment */
          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.test).toBe(0.8);
      expect(result.confidence).toBe(0.9);
      expect(result.critique).toBe('Good');
    });

    it('should preserve URLs with // in string values', async () => {
      const mockResponse = {
        message: {
          content: `{
            "scores": {"test": 0.8}, // comment here
            "confidence": 0.9,
            "explanation": "See: https://example.com/path", // more comment
            "critique": "Good"
          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.test).toBe(0.8);
      expect(result.confidence).toBe(0.9);
      // The explanation field should preserve the URL with //
      expect(result.explanation).toContain('https://example.com/path');
      expect(result.critique).toBe('Good');
    });

    it('should handle mixed comments and control characters', async () => {
      const mockResponse = {
        message: {
          content: `{
            "scores": {"test": 0.8}, // comment
            "confidence": 0.9, /* multi
            line */
            "explanation": "Line1\nLine2", // inline comment
            "critique": "Good"
          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.test).toBe(0.8);
      expect(result.confidence).toBe(0.9);
      expect(result.explanation).toContain('Line1');
      expect(result.critique).toBe('Good');
    });

    it('should handle trailing commas before closing braces', async () => {
      const mockResponse = {
        message: {
          content: `{
            "scores": {
              "intentAlignment": 0.8,
            },
            "confidence": 0.9,
            "critique": "Good",
          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.intentAlignment).toBe(0.8);
      expect(result.confidence).toBe(0.9);
      expect(result.critique).toBe('Good');
    });

    it('should handle trailing commas before closing brackets', async () => {
      const mockResponse = {
        message: {
          content: `{
            "scores": {
              "test": 0.8,
            },
            "confidence": 0.9,
            "items": ["item1", "item2",],
            "critique": "Good"
          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.test).toBe(0.8);
      expect(result.confidence).toBe(0.9);
      expect(result.critique).toBe('Good');
    });

    it('should handle trailing commas with whitespace', async () => {
      const mockResponse = {
        message: {
          content: `{
            "scores": {
              "intentAlignment": 0.8,

            },
            "confidence": 0.9,
            "critique": "Good",

          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.intentAlignment).toBe(0.8);
      expect(result.confidence).toBe(0.9);
      expect(result.critique).toBe('Good');
    });

    it('should handle trailing commas combined with comments', async () => {
      const mockResponse = {
        message: {
          content: `{
            "scores": {
              "intentAlignment": 0.8, // comment
            },
            "confidence": 0.9, /* comment */
            "critique": "Good",
          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.intentAlignment).toBe(0.8);
      expect(result.confidence).toBe(0.9);
      expect(result.critique).toBe('Good');
    });

    it('should handle nested objects with trailing commas', async () => {
      const mockResponse = {
        message: {
          content: `{
            "scores": {
              "intentAlignment": 0.8,
              "nested": {
                "value": 0.9,
              },
            },
            "confidence": 0.9,
            "critique": "Good",
          }`,
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole('intentAnalyst', {
        query: 'test',
        plan: {},
      });

      expect(result.scores.intentAlignment).toBe(0.8);
      expect(result.scores.nested.value).toBe(0.9);
      expect(result.confidence).toBe(0.9);
      expect(result.critique).toBe('Good');
    });
  });

  describe('evaluateWithPanel', () => {
    it('should run multiple evaluators in parallel', async () => {
      mockOllamaService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            scores: { test: 0.8 },
            confidence: 0.9,
            critique: 'Good',
          }),
        },
      });

      const results = await service.evaluateWithPanel(
        ['intentAnalyst', 'coverageChecker'],
        { query: 'test', plan: {} },
      );

      expect(results).toHaveLength(2);
      expect(mockOllamaService.chat).toHaveBeenCalledTimes(2);
    });
  });
});
