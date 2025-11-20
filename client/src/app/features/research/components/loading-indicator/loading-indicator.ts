import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface StageInfo {
  label: string;
  description: string;
}

@Component({
  selector: 'app-loading-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-indicator.html',
  styleUrls: ['./loading-indicator.scss']
})
export class LoadingIndicatorComponent {
  @Input() currentStage: number | null = null;

  stages: StageInfo[] = [
    {
      label: 'Analyzing query & searching...',
      description: 'AI is analyzing your question and searching the web'
    },
    {
      label: 'Fetching content from sources...',
      description: 'Retrieving full content from relevant sources'
    },
    {
      label: 'Synthesizing comprehensive answer...',
      description: 'AI is creating a comprehensive response'
    }
  ];

  get progressPercentage(): number {
    if (!this.currentStage) return 0;
    return (this.currentStage / 3) * 100;
  }

  get currentStageInfo(): StageInfo | null {
    if (!this.currentStage || this.currentStage < 1 || this.currentStage > 3) {
      return null;
    }
    return this.stages[this.currentStage - 1];
  }
}
