import { Component, OnInit, input, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LogsService } from '../../../../core/services/logs.service';
import { LogSession, LogDetail } from '../../../../models';
import { environment } from '../../../../../environments/environment';

interface HistoryItem {
  id: string;
  query: string;
  answer: string;
  timestamp: Date;
  logId: string;
  status: 'completed' | 'error' | 'incomplete';
}

interface SessionDetail {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  isLoading: boolean;
  error?: string;
}

@Component({
  selector: 'app-research-history',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterModule],
  templateUrl: './research-history.component.html',
  styleUrl: './research-history.component.scss'
})
export class ResearchHistoryComponent implements OnInit {
  // Services
  logsService = inject(LogsService);
  private router = inject(Router);
  private http = inject(HttpClient);

  // Inputs
  maxItems = input<number>(20);

  // State
  private expandedItemsSet = signal<Set<string>>(new Set());
  private sessionDetailsCache = signal<Map<string, SessionDetail>>(new Map());

  // Computed signals
  sessions = computed(() => this.logsService.sessions());

  historyItems = computed(() => {
    const sessions = this.sessions();
    const max = this.maxItems();

    // Convert sessions to history items and limit to maxItems
    return sessions
      .slice(0, max)
      .map(session => this.convertSessionToHistoryItem(session));
  });

  ngOnInit(): void {
    // Load sessions if not already loaded
    if (this.sessions().length === 0 && !this.logsService.isLoadingSessions()) {
      this.logsService.loadSessions();
    }
  }

  async toggleItem(sessionId: string): Promise<void> {
    const expanded = this.expandedItemsSet();
    const newSet = new Set(expanded);

    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
      // Fetch detail if not already cached
      if (!this.sessionDetailsCache().has(sessionId)) {
        await this.fetchSessionDetail(sessionId);
      }
    }

    this.expandedItemsSet.set(newSet);
  }

  private async fetchSessionDetail(logId: string): Promise<void> {
    // Set loading state
    const cache = new Map(this.sessionDetailsCache());
    cache.set(logId, { answer: '', sources: [], isLoading: true });
    this.sessionDetailsCache.set(cache);

    try {
      const detail = await firstValueFrom(
        this.http.get<{ logId: string; result?: { answer: string; sources: Array<{ title: string; url: string }> } }>(
          `${environment.apiUrl}/logs/sessions/${logId}`
        )
      );

      const updatedCache = new Map(this.sessionDetailsCache());
      updatedCache.set(logId, {
        answer: detail.result?.answer || 'No answer available',
        sources: detail.result?.sources || [],
        isLoading: false
      });
      this.sessionDetailsCache.set(updatedCache);
    } catch (error) {
      const updatedCache = new Map(this.sessionDetailsCache());
      updatedCache.set(logId, {
        answer: '',
        sources: [],
        isLoading: false,
        error: 'Failed to load details'
      });
      this.sessionDetailsCache.set(updatedCache);
    }
  }

  getSessionDetail(logId: string): SessionDetail | undefined {
    return this.sessionDetailsCache().get(logId);
  }

  isLoadingDetail(logId: string): boolean {
    return this.sessionDetailsCache().get(logId)?.isLoading ?? false;
  }

  isExpanded(sessionId: string): boolean {
    return this.expandedItemsSet().has(sessionId);
  }

  formatTimestamp(date: Date): string {
    // Validate date
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return 'Unknown date';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    // Format as date for older items
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  getAnswerPreview(answer: string, maxLength: number = 100): string {
    if (!answer) return 'No answer available';
    if (answer.length <= maxLength) return answer;
    return answer.substring(0, maxLength).trim() + '...';
  }

  navigateToDetails(logId: string): void {
    this.router.navigate(['/logs'], {
      queryParams: { logId }
    });
  }

  handleKeydown(event: KeyboardEvent, sessionId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleItem(sessionId);
    }
  }

  trackByLogId(index: number, item: HistoryItem): string {
    return `${index}-${item.logId}`;
  }

  private convertSessionToHistoryItem(session: LogSession): HistoryItem {
    return {
      id: session.logId,
      query: session.query,
      answer: this.extractAnswerFromSession(session),
      timestamp: new Date(session.timestamp),
      logId: session.logId,
      status: session.status
    };
  }

  private extractAnswerFromSession(session: LogSession): string {
    // For now, return a placeholder since LogSession doesn't include the answer
    // The full answer would need to be fetched from LogDetail when expanded
    // This is a simplified version for the history view
    const statusText = session.status === 'completed'
      ? 'Research completed successfully'
      : session.status === 'error'
      ? 'Research encountered an error'
      : 'Research incomplete';

    return `${statusText} • ${session.toolCallCount} tool call${session.toolCallCount !== 1 ? 's' : ''} • ${session.stageCount} stage${session.stageCount !== 1 ? 's' : ''}`;
  }
}
