import { LogEntry } from './log-entry.interface';

export type NodeType = 'stage' | 'tool' | 'llm' | 'retry';
export type NodeStatus = 'pending' | 'running' | 'completed' | 'error' | 'retrying';

export interface EnhancedLogEntry extends LogEntry {
  // Node lifecycle tracking
  nodeId: string;              // Unique identifier for this execution node
  parentNodeId?: string;        // Parent node in execution hierarchy
  nodeType: NodeType;

  // Timing information
  startTime: string;            // ISO timestamp when node initialized
  endTime?: string;             // ISO timestamp when node completed

  // State tracking
  status: NodeStatus;

  // Relationships for graph visualization
  dependencies: string[];       // nodeIds this node depends on
  triggeredBy?: string;         // nodeId that triggered this node

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
  event: 'start' | 'progress' | 'complete' | 'error';
  timestamp: string;
  data?: any;
  status?: NodeStatus;
}
