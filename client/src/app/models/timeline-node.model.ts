export interface TimelineNode {
  type: 'stage' | 'tool';
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
}
