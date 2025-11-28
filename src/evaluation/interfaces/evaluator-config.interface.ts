export interface EvaluatorRoleConfig {
  model: string;
  fallback?: string;
  dimensions: string[];
  promptTemplate: string;
}

export interface EvaluationConfig {
  enabled: boolean;

  planEvaluation: {
    enabled: boolean;
    iterationEnabled: boolean;
    maxAttempts: number;
    passThreshold: number;
    failAction: 'continue' | 'warn' | 'block';
  };

  retrievalEvaluation: {
    enabled: boolean;
    severeThreshold: number;
    failAction: 'continue' | 'warn' | 'block';
  };

  answerEvaluation: {
    enabled: boolean;
    regenerationEnabled: boolean;
    majorFailureThreshold: number;
    failAction: 'continue' | 'warn' | 'block';
  };

  evaluators: {
    intentAnalyst: EvaluatorRoleConfig;
    coverageChecker: EvaluatorRoleConfig;
    faithfulnessJudge: EvaluatorRoleConfig;
    qualityAssessor: EvaluatorRoleConfig;
    factChecker: EvaluatorRoleConfig;
    // Retrieval-specific evaluators
    sourceRelevance: EvaluatorRoleConfig;
    sourceQuality: EvaluatorRoleConfig;
    coverageCompleteness: EvaluatorRoleConfig;
    // Answer-specific evaluators
    faithfulness: EvaluatorRoleConfig;
    answerRelevance: EvaluatorRoleConfig;
    answerCompleteness: EvaluatorRoleConfig;
  };

  escalationModel: string;
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  enabled: true,

  planEvaluation: {
    enabled: true,
    iterationEnabled: true,
    maxAttempts: 3,
    passThreshold: 0.7,
    failAction: 'continue',
  },

  retrievalEvaluation: {
    enabled: true,
    severeThreshold: 0.5,
    failAction: 'continue',
  },

  answerEvaluation: {
    enabled: true,
    regenerationEnabled: true,
    majorFailureThreshold: 0.5,
    failAction: 'continue',
  },

  evaluators: {
    intentAnalyst: {
      model: 'llama3.1:8b',
      dimensions: ['intentAlignment', 'relevance'],
      promptTemplate: 'intent-analyst',
    },
    coverageChecker: {
      model: 'qwen3:14b',
      dimensions: ['queryCoverage', 'completeness', 'contextRecall'],
      promptTemplate: 'coverage-checker',
    },
    faithfulnessJudge: {
      model: 'llama3.1:8b',
      dimensions: ['faithfulness', 'contextPrecision'],
      promptTemplate: 'faithfulness-judge',
    },
    qualityAssessor: {
      model: 'qwen3:14b',
      dimensions: ['coherence', 'sourceQuality'],
      promptTemplate: 'quality-assessor',
    },
    factChecker: {
      model: 'qwen3:14b',
      dimensions: ['factualAccuracy'],
      promptTemplate: 'fact-checker',
    },
    // Retrieval-specific evaluators
    sourceRelevance: {
      model: 'llama3.1:8b',
      dimensions: ['contextRecall', 'contextPrecision'],
      promptTemplate: 'source-relevance',
    },
    sourceQuality: {
      model: 'qwen3:14b',
      dimensions: ['sourceQuality'],
      promptTemplate: 'source-quality',
    },
    coverageCompleteness: {
      model: 'qwen3:14b',
      dimensions: ['coverageCompleteness'],
      promptTemplate: 'coverage-completeness',
    },
    // Answer-specific evaluators
    faithfulness: {
      model: 'llama3.1:8b',
      dimensions: ['faithfulness'],
      promptTemplate: 'faithfulness',
    },
    answerRelevance: {
      model: 'llama3.1:8b',
      dimensions: ['answerRelevance'],
      promptTemplate: 'answer-relevance',
    },
    answerCompleteness: {
      model: 'qwen3:14b',
      dimensions: ['completeness', 'accuracy'],
      promptTemplate: 'answer-completeness',
    },
  },

  escalationModel: 'qwen3:30b',
};
