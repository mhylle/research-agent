import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineNode } from '../../../../models';
import { JsonViewerComponent } from '../json-viewer/json-viewer';

@Component({
  selector: 'app-tool-node',
  standalone: true,
  imports: [CommonModule, JsonViewerComponent],
  templateUrl: './tool-node.html',
  styleUrls: ['./tool-node.scss']
})
export class ToolNodeComponent {
  @Input() node!: TimelineNode;

  toggleExpand(): void {
    this.node.isExpanded = !this.node.isExpanded;
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }
}
