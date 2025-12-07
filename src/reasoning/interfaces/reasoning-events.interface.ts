export enum ReasoningEventType {
  THOUGHT = 'thought',
  ACTION_PLANNED = 'action_planned',
  OBSERVATION = 'observation',
  CONCLUSION = 'conclusion',
}

export interface ThoughtContext {
  stage: string;
  step: number;
  relatedTo?: string;
}

export interface ThoughtEvent {
  type: ReasoningEventType.THOUGHT;
  id: string;
  logId: string;
  timestamp: Date;
  content: string;
  context: ThoughtContext;
}

export interface ActionPlannedEvent {
  type: ReasoningEventType.ACTION_PLANNED;
  id: string;
  logId: string;
  timestamp: Date;
  action: string;
  tool: string;
  parameters: Record<string, unknown>;
  reasoning: string;
}

export interface ObservationEvent {
  type: ReasoningEventType.OBSERVATION;
  id: string;
  logId: string;
  timestamp: Date;
  actionId: string;
  result: string;
  analysis: string;
  implications: string[];
}

export interface ConclusionEvent {
  type: ReasoningEventType.CONCLUSION;
  id: string;
  logId: string;
  timestamp: Date;
  conclusion: string;
  supportingThoughts: string[];
  confidence: number;
  nextSteps?: string[];
}

export type ReasoningEvent =
  | ThoughtEvent
  | ActionPlannedEvent
  | ObservationEvent
  | ConclusionEvent;
