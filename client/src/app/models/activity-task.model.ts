export type TaskStatus = 'pending' | 'running' | 'completed' | 'error' | 'retrying';
export type TaskType = 'stage' | 'tool' | 'milestone';

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
  data?: Record<string, any>;
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
    data: Record<string, any>;
    progress: number;
    status: TaskStatus;
    timestamp: string;
  };
  data?: any;
  status?: TaskStatus;
}
