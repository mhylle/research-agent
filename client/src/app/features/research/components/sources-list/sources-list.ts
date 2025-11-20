import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Source } from '../../../../models';

@Component({
  selector: 'app-sources-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sources-list.html',
  styleUrls: ['./sources-list.scss']
})
export class SourcesListComponent {
  @Input() sources: Source[] = [];

  isExpanded = false;

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  getRelevanceClass(relevance: string | undefined): string {
    return `sources-list__badge--${relevance || 'low'}`;
  }

  truncateUrl(url: string, maxLength: number = 50): string {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  }
}
