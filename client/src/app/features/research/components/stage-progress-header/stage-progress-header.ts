import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stage-progress-header',
  imports: [CommonModule],
  templateUrl: './stage-progress-header.html',
  styleUrls: ['./stage-progress-header.scss']
})
export class StageProgressHeaderComponent {
  // Dynamic phase support
  currentPhase = input<number>(1);
  totalPhases = input<number>(3);
  phaseName = input<string>('');
  progress = input.required<number>();

  // Backward compatibility with old "stage" input
  stage = input<number>();

  // Computed values
  displayPhase = computed(() => this.stage() ?? this.currentPhase());
  displayName = computed(() => {
    const name = this.phaseName();
    return name || this.getDefaultStageName(this.displayPhase());
  });

  private getDefaultStageName(stage: number): string {
    const names: Record<number, string> = {
      1: 'Analyzing query & searching',
      2: 'Content fetch & selection',
      3: 'Synthesis & answer generation'
    };
    return names[stage] || `Phase ${stage}`;
  }

  getStageIcon(stage: number): string {
    const icons: Record<number, string> = { 1: '🔍', 2: '📄', 3: '✨' };
    return icons[stage] || '📋';
  }
}
