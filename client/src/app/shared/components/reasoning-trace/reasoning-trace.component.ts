import { Component, input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';

export interface ReasoningEvent {
  type: 'thought' | 'action_planned' | 'observation' | 'conclusion';
  id: string;
  timestamp: Date;
  content?: string;
  action?: string;
  tool?: string;
  parameters?: Record<string, unknown>;
  reasoning?: string;
  actionId?: string;
  result?: string;
  analysis?: string;
  implications?: string[];
  conclusion?: string;
  supportingThoughts?: string[];
  confidence?: number;
  nextSteps?: string[];
  context?: {
    stage: string;
    step: number;
    relatedTo?: string;
  };
}

@Component({
  selector: 'app-reasoning-trace',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './reasoning-trace.component.html',
  styleUrl: './reasoning-trace.component.scss'
})
export class ReasoningTraceComponent {
  reasoningEvents = input.required<ReasoningEvent[]>();

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      thought: 'Thinking',
      action_planned: 'Planning Action',
      observation: 'Observing',
      conclusion: 'Concluding'
    };
    return labels[type] || type;
  }

  getEventText(event: ReasoningEvent): string {
    switch (event.type) {
      case 'thought':
        return event.content || '';
      case 'action_planned':
        return event.action || '';
      case 'observation':
        return event.analysis || event.result || '';
      case 'conclusion':
        return event.conclusion || '';
      default:
        return '';
    }
  }

  getConfidenceClass(confidence: number): string {
    if (confidence >= 0.85) return 'confidence--high';
    if (confidence >= 0.7) return 'confidence--medium';
    if (confidence >= 0.5) return 'confidence--low';
    return 'confidence--very-low';
  }
}
