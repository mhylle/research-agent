export type TaskStatus = 'pending' | 'running' | 'completed' | 'error' | 'retrying';
export type TaskType = 'stage' | 'tool' | 'milestone';

/**
 * Represents a milestone event for granular progress feedback
 */
export interface MilestoneTask {
  id: string;
  nodeId: string;
  milestoneId: string;
  stage: 1 | 2 | 3;
  template: string;
  templateData: Record<string, unknown>;
  description: string;  // Formatted template with data substituted
  progress: number;     // 0-100
  status: TaskStatus;
  timestamp: Date;
}

export interface ActivityTask {
  id: string;
  nodeId: string;
  stage: 1 | 2 | 3;
  type: TaskType;
  description: string;
  progress: number;  // 0-100
  status: TaskStatus;
  timestamp: Date;
  duration?: number;
  error?: {
    message: string;
    code?: string;
    timestamp: Date;
  };
  retryCount: number;
  canRetry: boolean;
  data?: Record<string, unknown>;
  // Step input/output fields
  toolName?: string;           // The executor tool name (tavily_search, web_fetch, synthesize, etc.)
  input?: Record<string, unknown>;   // Step configuration/input passed to executor
  output?: unknown;            // Result from executor (can be string, array, or object)
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  metadata?: Record<string, unknown>; // Additional metadata from executor
}

export interface MilestoneEventData {
  logId: string;
  nodeId: string;
  parentNodeId?: string;
  nodeType: string;
  event: 'start' | 'progress' | 'complete' | 'error' | 'milestone';
  timestamp: string;
  milestone?: {
    milestoneId: string;
    stage: 1 | 2 | 3;
    template: string;
    data: Record<string, unknown>;
    progress: number;
    status: TaskStatus;
    timestamp: string;
  };
  data?: Record<string, unknown>;
  status?: TaskStatus;
}
