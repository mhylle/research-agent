import { Component, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ClaimConfidence {
  claimId: string;
  claimText: string;
  confidence: number;
  level: 'high' | 'medium' | 'low' | 'very_low';
  entailmentScore: number;
  suScore: number;
  supportingSources: number;
}

export interface ConfidenceResult {
  overallConfidence: number;
  level: 'high' | 'medium' | 'low' | 'very_low';
  claimConfidences: ClaimConfidence[];
  methodology: {
    entailmentWeight: number;
    suScoreWeight: number;
    sourceCountWeight: number;
  };
  recommendations: string[];
}

@Component({
  selector: 'app-confidence-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confidence-display.component.html',
  styleUrl: './confidence-display.component.scss'
})
export class ConfidenceDisplayComponent {
  result = input.required<ConfidenceResult>();
  showDetails = signal(false);

  toggleDetails(): void {
    this.showDetails.update(v => !v);
  }

  getLevelLabel(level: string): string {
    const labels: Record<string, string> = {
      high: 'High Confidence',
      medium: 'Moderate Confidence',
      low: 'Low Confidence',
      very_low: 'Very Low Confidence'
    };
    return labels[level] || level;
  }
}
