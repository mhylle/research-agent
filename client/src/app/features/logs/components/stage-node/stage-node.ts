import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { TimelineNode } from '../../../../models';
import { JsonViewerComponent } from '../json-viewer/json-viewer';
import { ToolNodeComponent } from '../tool-node/tool-node';

@Component({
  selector: 'app-stage-node',
  standalone: true,
  imports: [CommonModule, JsonViewerComponent, ToolNodeComponent],
  templateUrl: './stage-node.html',
  styleUrls: ['./stage-node.scss']
})
export class StageNodeComponent {
  @Input() node!: TimelineNode;
  @Input() isLast = false;

  toggleExpand(): void {
    this.node.isExpanded = !this.node.isExpanded;
  }

  formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
