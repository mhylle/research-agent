// Test fixtures for evaluation tests
import { EvaluationRecordEntity } from '../entities/evaluation-record.entity';

export const createMockPlan = () => ({
  id: 'test-plan-123',
  query: 'What is quantum computing?',
  phases: [
    {
      id: 'phase-1',
      name: 'Research',
      description: 'Research quantum computing basics',
      steps: [
        {
          id: 'step-1',
          toolName: 'tavily-search',
          config: { query: 'quantum computing basics' },
        },
      ],
    },
  ],
  searchQueries: ['quantum computing basics', 'quantum computers explained'],
});

export const createMockRetrievalContent = () => [
  {
    url: 'https://example.com/quantum-basics',
    title: 'Quantum Computing Basics',
    content:
      'Quantum computing is a revolutionary approach to computation that leverages quantum mechanics...',
    fetchedAt: new Date('2024-01-01'),
  },
  {
    url: 'https://example.com/quantum-explained',
    title: 'Quantum Computers Explained',
    content:
      'Unlike classical computers, quantum computers use qubits instead of bits...',
    fetchedAt: new Date('2024-01-01'),
  },
];

export const createMockAnswer = () =>
  `Quantum computing is a revolutionary approach to computation that leverages the principles of quantum mechanics.
Unlike classical computers that use bits (0 or 1), quantum computers use qubits which can exist in multiple states
simultaneously through superposition. This allows quantum computers to process vast amounts of information in parallel.

Key characteristics:
- Uses quantum superposition and entanglement
- Exponentially faster for certain problems
- Applications in cryptography, drug discovery, and optimization`;

export const createMockEvaluationRecord = (
  overrides?: Partial<EvaluationRecordEntity>,
): Partial<EvaluationRecordEntity> => ({
  logId: 'test-log-123',
  queryId: 'test-query-123',
  userQuery: 'What is quantum computing?',
  planEvaluation: {
    attempts: [
      {
        attemptNumber: 1,
        panelEvaluations: [
          {
            role: 'intentAnalyst',
            scores: { intentAlignment: 0.9 },
            confidence: 0.9,
            critique: 'Excellent alignment with user intent',
          },
        ],
        aggregatedScores: { intentAlignment: 0.9, queryCoverage: 0.85 },
        overallScore: 0.87,
        passed: true,
      },
    ],
    finalScores: { intentAlignment: 0.9, queryCoverage: 0.85 },
    explanations: {
      intentAlignment: 'Plan perfectly captures user intent',
      queryCoverage: 'All aspects covered',
    },
    passed: true,
    totalIterations: 1,
    escalatedToLargeModel: false,
  },
  retrievalEvaluation: {
    scores: {
      contextRecall: 0.85,
      contextPrecision: 0.8,
      sourceQuality: 0.9,
    },
    explanations: {
      contextRecall: 'Good coverage of key concepts',
      contextPrecision: 'Minimal irrelevant content',
      sourceQuality: 'Credible sources',
    },
    passed: true,
    flaggedSevere: false,
    sourceDetails: [
      {
        url: 'https://example.com/quantum-basics',
        relevanceScore: 0.9,
        qualityScore: 0.85,
      },
    ],
  },
  answerEvaluation: {
    attempts: [
      {
        attemptNumber: 1,
        panelEvaluations: [
          {
            role: 'faithfulness',
            scores: { faithfulness: 0.9 },
            confidence: 0.9,
            critique: 'Answer is faithful to sources',
          },
        ],
        aggregatedScores: {
          faithfulness: 0.9,
          answerRelevance: 0.85,
          completeness: 0.8,
        },
        overallScore: 0.85,
        passed: true,
      },
    ],
    finalScores: {
      faithfulness: 0.9,
      answerRelevance: 0.85,
      completeness: 0.8,
    },
    explanations: {
      faithfulness: 'Answer is grounded in sources',
      answerRelevance: 'Addresses the query well',
      completeness: 'Good coverage',
    },
    passed: true,
    regenerated: false,
  },
  overallScore: 0.86,
  evaluationSkipped: false,
  timestamp: new Date('2024-01-01'),
  ...overrides,
});

export const createMockEvaluatorResult = (
  role: string,
  scores: Record<string, number>,
) => ({
  role,
  scores,
  confidence: 0.9,
  critique: `${role} evaluation critique`,
  suggestions: [`Suggestion for ${role}`],
});

// Mock Ollama LLM responses for deterministic testing
export const mockOllamaResponses = {
  intentAnalyst: {
    role: 'json_object',
    content: JSON.stringify({
      scores: {
        intentAlignment: 0.9,
      },
      confidence: 0.9,
      critique: 'The plan aligns well with user intent',
      suggestions: ['Consider adding more specific queries'],
    }),
  },
  coverageChecker: {
    role: 'json_object',
    content: JSON.stringify({
      scores: {
        queryCoverage: 0.85,
        scopeAppropriateness: 0.8,
      },
      confidence: 0.85,
      critique: 'Good coverage of the topic',
      suggestions: ['Add queries about quantum algorithms'],
    }),
  },
  sourceRelevance: {
    role: 'json_object',
    content: JSON.stringify({
      scores: {
        contextRecall: 0.85,
      },
      confidence: 0.85,
      critique: 'Sources are relevant to the query',
      suggestions: ['Could include more recent research'],
    }),
  },
  sourceQuality: {
    role: 'json_object',
    content: JSON.stringify({
      scores: {
        sourceQuality: 0.9,
      },
      confidence: 0.9,
      critique: 'High-quality, authoritative sources',
      suggestions: [],
    }),
  },
  coverageCompleteness: {
    role: 'json_object',
    content: JSON.stringify({
      scores: {
        contextPrecision: 0.8,
      },
      confidence: 0.8,
      critique: 'Sources provide comprehensive coverage',
      suggestions: ['Include practical examples'],
    }),
  },
  faithfulness: {
    role: 'json_object',
    content: JSON.stringify({
      scores: {
        faithfulness: 0.9,
      },
      confidence: 0.9,
      critique: 'Answer is faithful to source material',
      suggestions: [],
    }),
  },
  answerRelevance: {
    role: 'json_object',
    content: JSON.stringify({
      scores: {
        answerRelevance: 0.85,
      },
      confidence: 0.85,
      critique: 'Answer is relevant to the query',
      suggestions: ['Add more technical details'],
    }),
  },
  answerCompleteness: {
    role: 'json_object',
    content: JSON.stringify({
      scores: {
        completeness: 0.8,
        accuracy: 0.85,
      },
      confidence: 0.8,
      critique: 'Answer is reasonably complete',
      suggestions: ['Include information about limitations'],
    }),
  },
};

// Helper to create a mock LLM service
export const createMockLLMService = () => ({
  generateResponse: jest.fn((prompt: string, options?: any) => {
    // Determine which evaluator is being called based on prompt content
    if (prompt.includes('Intent Analyst')) {
      return Promise.resolve({
        response: mockOllamaResponses.intentAnalyst.content,
      });
    }
    if (prompt.includes('Coverage Checker')) {
      return Promise.resolve({
        response: mockOllamaResponses.coverageChecker.content,
      });
    }
    if (prompt.includes('Source Relevance')) {
      return Promise.resolve({
        response: mockOllamaResponses.sourceRelevance.content,
      });
    }
    if (prompt.includes('Source Quality')) {
      return Promise.resolve({
        response: mockOllamaResponses.sourceQuality.content,
      });
    }
    if (prompt.includes('Coverage Completeness')) {
      return Promise.resolve({
        response: mockOllamaResponses.coverageCompleteness.content,
      });
    }
    if (prompt.includes('Faithfulness')) {
      return Promise.resolve({
        response: mockOllamaResponses.faithfulness.content,
      });
    }
    if (prompt.includes('Answer Relevance')) {
      return Promise.resolve({
        response: mockOllamaResponses.answerRelevance.content,
      });
    }
    if (prompt.includes('Answer Completeness')) {
      return Promise.resolve({
        response: mockOllamaResponses.answerCompleteness.content,
      });
    }

    // Default response
    return Promise.resolve({
      response: JSON.stringify({
        scores: { default: 0.8 },
        confidence: 0.8,
        critique: 'Default evaluation',
        suggestions: [],
      }),
    });
  }),
});
