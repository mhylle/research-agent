export interface SubGoal {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: number;
  dependencies: string[];
}

export interface GatheredInfo {
  id: string;
  content: string;
  source: string;
  relevance: number;
  addedAt: Date;
}

export interface Hypothesis {
  id: string;
  statement: string;
  confidence: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
}

export interface Gap {
  id: string;
  description: string;
  severity: 'critical' | 'important' | 'minor';
  suggestedAction: string;
}

export interface WorkingMemory {
  taskId: string;
  logId: string;
  query: string;
  startTime: Date;
  currentPhase: string;
  currentStep: number;
  primaryGoal: string;
  subGoals: SubGoal[];
  gatheredInformation: GatheredInfo[];
  activeHypotheses: Hypothesis[];
  identifiedGaps: Gap[];
  scratchPad: Map<string, unknown>;
  thoughtChain: string[];
}
