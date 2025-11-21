import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineNode, LogSession } from '../../../../models';
import { StageNodeComponent } from '../stage-node/stage-node';

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

  copyLogId(): void {
    navigator.clipboard.writeText(this.session.logId).then(() => {
      alert('LogID copied to clipboard!');
    });
  }

  formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
