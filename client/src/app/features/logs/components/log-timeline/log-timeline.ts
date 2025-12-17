import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { TimelineNode, LogSession, ResearchResultData } from '../../../../models';
import { StageNodeComponent } from '../stage-node/stage-node';
import { MarkdownService } from '../../../../core/services/markdown.service';

@Component({
  selector: 'app-log-timeline',
  standalone: true,
  imports: [CommonModule, StageNodeComponent],
  templateUrl: './log-timeline.html',
  styleUrls: ['./log-timeline.scss']
})
export class LogTimelineComponent {
  @Input() session!: LogSession;
  @Input() timelineNodes: TimelineNode[] = [];
  @Input() isLoading = false;
  @Input() result?: ResearchResultData;

  private markdownService = inject(MarkdownService);

  get parsedAnswerHtml() {
    if (this.result?.answer) {
      return this.markdownService.parseToSafeHtml(this.result.answer);
    }
    return null;
  }

  copyLogId(): void {
    navigator.clipboard.writeText(this.session.logId).then(() => {
      alert('LogID copied to clipboard!');
    });
  }

  downloadPdf(): void {
    window.open(`/api/pdf/research/${this.session.logId}`, '_blank');
  }

  formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
