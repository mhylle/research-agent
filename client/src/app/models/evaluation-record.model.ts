import { EvaluationResult, EvaluationPhase, EvaluationStatus } from './evaluation.model';

/**
 * Historical evaluation record with full metadata
 */
export interface EvaluationRecord {
  id: string;
  query: string;
  logId: string;
  sessionId: string;
  timestamp: string;
  overallStatus: EvaluationStatus;
  passed: boolean;
  evaluations: EvaluationResult[];
  metadata?: {
    duration?: number;
    modelUsed?: string;
    totalAttempts?: number;
  };
}

/**
 * Evaluation statistics summary
 */
export interface EvaluationStats {
  totalRecords: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  averageScores: {
    intentAlignment: number;
    queryCoverage: number;
    scopeAppropriateness: number;
    relevance: number;
    completeness: number;
    accuracy: number;
  };
  phaseBreakdown: {
    phase: EvaluationPhase;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }[];
  scoreDistribution: {
    range: string;
    count: number;
  }[];
}

/**
 * Filters for evaluation list
 */
export interface EvaluationFilters {
  status?: 'passed' | 'failed' | 'all';
  phase?: EvaluationPhase | 'all';
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
}

/**
 * Pagination params
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Paginated evaluation response
 */
export interface PaginatedEvaluations {
  records: EvaluationRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
