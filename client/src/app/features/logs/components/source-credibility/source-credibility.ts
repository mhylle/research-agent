import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SourceDetail {
  url: string;
  relevanceScore: number;
  qualityScore: number;
  resultType: string;
  actionableScore: number;
}

@Component({
  selector: 'app-source-credibility',
  imports: [CommonModule],
  templateUrl: './source-credibility.html',
  styleUrls: ['./source-credibility.scss']
})
export class SourceCredibilityComponent {
  @Input() sources: SourceDetail[] = [];

  isExpanded = false;
  sortBy: 'relevance' | 'quality' = 'relevance';

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  toggleSort(): void {
    this.sortBy = this.sortBy === 'relevance' ? 'quality' : 'relevance';
  }

  getSortedSources(): SourceDetail[] {
    if (!this.sources || this.sources.length === 0) return [];

    return [...this.sources].sort((a, b) => {
      if (this.sortBy === 'relevance') {
        return b.relevanceScore - a.relevanceScore;
      } else {
        return b.qualityScore - a.qualityScore;
      }
    });
  }

  getScoreColor(score: number): string {
    const percentage = score * 100;
    if (percentage > 70) return 'high';
    if (percentage >= 50) return 'medium';
    return 'low';
  }

  truncateUrl(url: string, maxLength: number = 45): string {
    if (url.length <= maxLength) return url;

    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      const path = urlObj.pathname + urlObj.search;

      if (domain.length + path.length <= maxLength) {
        return domain + path;
      }

      const availablePathLength = maxLength - domain.length - 3; // 3 for "..."
      if (availablePathLength > 10) {
        return domain + path.substring(0, availablePathLength) + '...';
      }

      return domain;
    } catch {
      return url.substring(0, maxLength) + '...';
    }
  }

  formatScore(score: number): string {
    return Math.round(score * 100) + '%';
  }

  getResultTypeBadgeColor(resultType: string): string {
    const type = resultType.toUpperCase();
    switch(type) {
      case 'NAVIGATION':
        return 'navigation';
      case 'ARTICLE':
        return 'article';
      case 'SNIPPET':
        return 'snippet';
      default:
        return 'default';
    }
  }
}
