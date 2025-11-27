import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EvaluationResult, EvaluationScores } from '../../../../models';

@Component({
  selector: 'app-evaluation-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './evaluation-display.component.html',
  styleUrls: ['./evaluation-display.component.scss']
})
export class EvaluationDisplayComponent {
  // Input signal for evaluation result
  evaluation = input<EvaluationResult | null>();

  // Computed properties for display
  readonly hasScores = computed(() => {
    const eval_ = this.evaluation();
    return eval_ && eval_.scores && Object.keys(eval_.scores).length > 0;
  });

  readonly scoreEntries = computed(() => {
    const eval_ = this.evaluation();
    if (!eval_ || !eval_.scores) return [];

    return Object.entries(eval_.scores)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => ({
        label: this.formatScoreLabel(key),
        value: value as number,
        percentage: Math.round((value as number) * 100),
        level: this.getScoreLevel(value as number)
      }))
      .sort((a, b) => b.value - a.value); // Sort by score descending
  });

  readonly statusClass = computed(() => {
    const eval_ = this.evaluation();
    if (!eval_) return '';

    switch (eval_.status) {
      case 'passed':
        return 'evaluation-display--passed';
      case 'failed':
        return 'evaluation-display--failed';
      case 'skipped':
        return 'evaluation-display--skipped';
      case 'in_progress':
        return 'evaluation-display--in-progress';
      default:
        return '';
    }
  });

  readonly statusIcon = computed(() => {
    const eval_ = this.evaluation();
    if (!eval_) return '';

    switch (eval_.status) {
      case 'passed':
        return '✅';
      case 'failed':
        return '❌';
      case 'skipped':
        return '⏭️';
      case 'in_progress':
        return '🔄';
      default:
        return '';
    }
  });

  readonly statusText = computed(() => {
    const eval_ = this.evaluation();
    if (!eval_) return '';

    switch (eval_.status) {
      case 'passed':
        return 'Passed';
      case 'failed':
        return 'Failed';
      case 'skipped':
        return 'Skipped';
      case 'in_progress':
        return 'Evaluating';
      default:
        return '';
    }
  });

  readonly confidencePercentage = computed(() => {
    const eval_ = this.evaluation();
    return eval_?.confidence ? Math.round(eval_.confidence * 100) : null;
  });

  readonly phaseLabel = computed(() => {
    const eval_ = this.evaluation();
    if (!eval_) return '';

    switch (eval_.phase) {
      case 'plan':
        return 'Plan Quality';
      case 'retrieval':
        return 'Retrieval Quality';
      case 'answer':
        return 'Answer Quality';
      default:
        return 'Quality';
    }
  });

  /**
   * Format score label from camelCase to readable text
   */
  private formatScoreLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Determine score level for color coding
   */
  private getScoreLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.7) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Get CSS class for score level
   */
  getScoreLevelClass(level: string): string {
    return `score-level--${level}`;
  }
}
