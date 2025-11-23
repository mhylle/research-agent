export type NodeType = 'stage' | 'tool' | 'llm' | 'retry';
export type NodeStatus = 'pending' | 'running' | 'completed' | 'error' | 'retrying';

export interface GraphNode {
  // Identity
  id: string;
  type: NodeType;
  name: string;

  // Visual properties
  icon: string;
  color: string;
  size: 'small' | 'medium' | 'large';

  // Lifecycle
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: NodeStatus;

  // Relationships
  parentId?: string;
  childrenIds: string[];
  dependsOn: string[];

  // Position (for force-directed graph)
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;

  // Data
  input?: any;
  output?: any;
  error?: string;
  metrics?: NodeMetrics;
}

export interface NodeMetrics {
  tokensUsed?: number;
  latency?: number;
  modelLatency?: number;     // LLM execution time
  toolLatency?: number;       // Tool execution time
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
  source: string | GraphNode;
  target: string | GraphNode;
  type: 'parent-child' | 'dependency' | 'data-flow' | 'retry';
  label?: string;
  animated?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: GraphMetadata;
}

export interface GraphMetadata {
  startTime?: Date;
  endTime?: Date;
  totalDuration?: number;
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
