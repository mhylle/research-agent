import {
  NodeType,
  NodeStatus,
} from '../../logging/interfaces/enhanced-log-entry.interface';

export interface GraphNode {
  // Identity
  id: string; // Same as nodeId in LogEntry
  type: NodeType;
  name: string; // Human-readable name

  // Visual properties
  icon: string;
  color: string;
  size: 'small' | 'medium' | 'large';

  // Lifecycle
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  status: NodeStatus;

  // Relationships
  parentId?: string;
  childrenIds: string[];
  dependsOn: string[]; // For showing dependency edges

  // Position (for force-directed graph)
  x?: number;
  y?: number;

  // Data
  input?: any;
  output?: any;
  error?: string;
  metrics?: NodeMetrics;
}

export interface NodeMetrics {
  tokensUsed?: number;
  latency?: number;
  modelLatency?: number; // LLM execution time
  toolLatency?: number; // Tool execution time
  retryCount?: number;
  cacheHit?: boolean;

  // Enhanced web_fetch metadata
  extractionMetadata?: {
    downloadDuration?: number;
    readability?: {
      attempted: boolean;
      success: boolean;
      confidence: number;
      duration: number;
      contentLength: number;
    };
    vision?: {
      attempted: boolean;
      success: boolean;
      confidence: number;
      duration: number;
      model: string;
      promptLength: number;
      responseLength: number;
      screenshotSize?: number;
    };
    cheerio?: {
      attempted: boolean;
      success: boolean;
      duration: number;
      contentLength: number;
    };
    selectionReason: string;
    totalDuration: number;
  };
  screenshotPath?: string;
}

export interface GraphEdge {
  id: string;
  source: string; // nodeId
  target: string; // nodeId
  type: 'parent-child' | 'dependency' | 'data-flow' | 'retry';
  label?: string;
  animated?: boolean; // For real-time visualization
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    startTime?: Date;
    endTime?: Date;
    totalDuration?: number;
  };
}
