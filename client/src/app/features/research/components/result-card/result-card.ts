import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import type { ResearchResult } from '../../../../models';
import { SourcesListComponent } from '../sources-list/sources-list';

@Component({
  selector: 'app-result-card',
  standalone: true,
  imports: [CommonModule, SourcesListComponent, RouterModule],
  templateUrl: './result-card.html',
  styleUrls: ['./result-card.scss']
})
export class ResultCardComponent {
  @Input() result!: ResearchResult;

  copyAnswer(): void {
    navigator.clipboard.writeText(this.result.answer).then(() => {
      alert('Answer copied to clipboard!');
    });
  }

  formatTimestamp(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  formatExecutionTime(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
