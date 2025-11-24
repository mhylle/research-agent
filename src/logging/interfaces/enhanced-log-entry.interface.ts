import { LogEntry } from './log-entry.interface';

export type NodeType = 'stage' | 'tool' | 'llm' | 'retry';
export type NodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'retrying';

export interface EnhancedLogEntry extends LogEntry {
  // Node lifecycle tracking
  nodeId: string; // Unique identifier for this execution node
  parentNodeId?: string; // Parent node in execution hierarchy
  nodeType: NodeType;

  // Timing information
  startTime: string; // ISO timestamp when node initialized
  endTime?: string; // ISO timestamp when node completed

  // State tracking
  status: NodeStatus;

  // Relationships for graph visualization
  dependencies: string[]; // nodeIds this node depends on
  triggeredBy?: string; // nodeId that triggered this node

  // Performance metrics
  metrics?: {
    tokensUsed?: number;
    modelLatency?: number;
    toolLatency?: number;
    retryCount?: number;
  };
}

export interface NodeLifecycleEvent {
  logId: string;
  nodeId: string;
  parentNodeId?: string;
  nodeType: NodeType;
  event: 'start' | 'progress' | 'complete' | 'error' | 'milestone';
  timestamp: string;
  data?: any;
  status?: NodeStatus;
}

export interface MilestoneTemplate {
  id: string;
  stage: 1 | 2 | 3;
  template: string; // e.g., "Searching {count} databases: {sources}"
  expectedProgress: number; // 0-100
  order: number; // Execution order within stage
}

export interface MilestoneData {
  milestoneId: string;
  stage: 1 | 2 | 3;
  template: string;
  data: Record<string, any>; // Dynamic values for template placeholders
  progress: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  timestamp: string;
}

export interface MilestoneEvent extends NodeLifecycleEvent {
  event: 'milestone';
  milestone: MilestoneData;
}
