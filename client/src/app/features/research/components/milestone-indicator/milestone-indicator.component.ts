import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MilestoneTask } from '../../../../models';

@Component({
  selector: 'app-milestone-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './milestone-indicator.component.html',
  styleUrl: './milestone-indicator.component.scss'
})
export class MilestoneIndicatorComponent {
  milestone = input.required<MilestoneTask | null>();

  /**
   * Get stage-specific icon
   */
  stageIcon = computed(() => {
    const m = this.milestone();
    if (!m) return '';

    switch (m.stage) {
      case 1: return '🔍'; // Search/Query Analysis
      case 2: return '🌐'; // Content Fetch
      case 3: return '🤖'; // Synthesis
      default: return '⏳';
    }
  });

  /**
   * Get stage-specific label
   */
  stageLabel = computed(() => {
    const m = this.milestone();
    if (!m) return '';

    switch (m.stage) {
      case 1: return 'Search';
      case 2: return 'Fetch';
      case 3: return 'Synthesis';
      default: return 'Processing';
    }
  });

  /**
   * Get progress bar width style
   */
  progressWidth = computed(() => {
    const m = this.milestone();
    return m ? `${m.progress}%` : '0%';
  });

  /**
   * Determine if the milestone is complete
   */
  isComplete = computed(() => {
    const m = this.milestone();
    return m?.status === 'completed';
  });
}
