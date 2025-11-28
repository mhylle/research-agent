import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EvaluationStats } from '../../models/evaluation-record.model';

@Component({
  selector: 'app-evaluation-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './evaluation-stats.component.html',
  styleUrls: ['./evaluation-stats.component.scss']
})
export class EvaluationStatsComponent {
  stats = input.required<EvaluationStats>();

  // Computed values for display
  protected passRateClass = computed(() => {
    const rate = this.stats().passRate;
    if (rate >= 80) return 'excellent';
    if (rate >= 60) return 'good';
    if (rate >= 40) return 'fair';
    return 'poor';
  });

  protected averageScoreEntries = computed(() => {
    const scores = this.stats().averageScores;
    return [
      { label: 'Intent Alignment', value: scores.intentAlignment, key: 'intentAlignment' },
      { label: 'Query Coverage', value: scores.queryCoverage, key: 'queryCoverage' },
      { label: 'Scope', value: scores.scopeAppropriateness, key: 'scopeAppropriateness' },
      { label: 'Relevance', value: scores.relevance, key: 'relevance' },
      { label: 'Completeness', value: scores.completeness, key: 'completeness' },
      { label: 'Accuracy', value: scores.accuracy, key: 'accuracy' }
    ];
  });

  protected getScoreClass(score: number): string {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    return 'poor';
  }

  protected getScorePercentage(score: number): number {
    return Math.round(score * 100);
  }
}
