import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stage-progress-header',
  imports: [CommonModule],
  templateUrl: './stage-progress-header.html',
  styleUrls: ['./stage-progress-header.scss']
})
export class StageProgressHeaderComponent {
  stage = input.required<number>();
  progress = input.required<number>();

  getStageName(stage: number): string {
    const names: Record<number, string> = {
      1: 'Analyzing query & searching',
      2: 'Content fetch & selection',
      3: 'Synthesis & answer generation'
    };
    return names[stage] || `Stage ${stage}`;
  }

  getStageIcon(stage: number): string {
    const icons: Record<number, string> = { 1: '🔍', 2: '📄', 3: '✨' };
    return icons[stage] || '📋';
  }
}
