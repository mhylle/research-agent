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
    timeout: number;
    passThreshold: number;
    failAction: 'continue' | 'warn' | 'block';
  };

  retrievalEvaluation: {
    enabled: boolean;
    timeout: number;
    severeThreshold: number;
    failAction: 'continue' | 'warn' | 'block';
  };

  answerEvaluation: {
    enabled: boolean;
    regenerationEnabled: boolean;
    timeout: number;
    majorFailureThreshold: number;
    failAction: 'continue' | 'warn' | 'block';
  };

  evaluators: {
    intentAnalyst: EvaluatorRoleConfig;
    coverageChecker: EvaluatorRoleConfig;
    faithfulnessJudge: EvaluatorRoleConfig;
    qualityAssessor: EvaluatorRoleConfig;
    factChecker: EvaluatorRoleConfig;
  };

  escalationModel: string;
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  enabled: true,

  planEvaluation: {
    enabled: true,
    iterationEnabled: true,
    maxAttempts: 3,
    timeout: 60000,
    passThreshold: 0.7,
    failAction: 'continue',
  },

  retrievalEvaluation: {
    enabled: true,
    timeout: 30000,
    severeThreshold: 0.5,
    failAction: 'continue',
  },

  answerEvaluation: {
    enabled: true,
    regenerationEnabled: true,
    timeout: 45000,
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
  },

  escalationModel: 'qwen3:30b',
};
