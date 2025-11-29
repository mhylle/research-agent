export interface TimelineNode {
  type: 'stage' | 'tool' | 'planning' | 'milestone' | 'recovery';
  id: string;
  name: string;
  icon: string;
  color: string;
  duration: number;
  timestamp: string;
  input?: any;
  output?: any;
  children?: TimelineNode[];
  isExpanded: boolean;
  status?: 'pending' | 'running' | 'completed' | 'error' | 'skipped' | 'abandoned';
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  metadata?: {
    isAutoAdded?: boolean;
    isAbandoned?: boolean;
    planId?: string;
    iterationCount?: number;
    recoveryReason?: string;
    stage?: string;
    progress?: number;
    emptyPhaseCount?: number;
    failureCount?: number;
    [key: string]: any;
  };
  milestones?: TimelineNode[];
}
