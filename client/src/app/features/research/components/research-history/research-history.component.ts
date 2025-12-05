import { Component, OnInit, input, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { LogsService } from '../../../../core/services/logs.service';
import { LogSession } from '../../../../models';

interface HistoryItem {
  id: string;
  query: string;
  answer: string;
  timestamp: Date;
  logId: string;
  status: 'completed' | 'error' | 'incomplete';
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

  // Inputs
  maxItems = input<number>(20);

  // State
  private expandedItemsSet = signal<Set<string>>(new Set());

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

  toggleItem(sessionId: string): void {
    const expanded = this.expandedItemsSet();
    const newSet = new Set(expanded);

    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
    }

    this.expandedItemsSet.set(newSet);
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
    // Return the actual answer if available
    if (session.answer) {
      return session.answer;
    }

    // Fallback for sessions without answer (older or in-progress sessions)
    const statusText = session.status === 'completed'
      ? 'Research completed successfully'
      : session.status === 'error'
      ? 'Research encountered an error'
      : 'Research in progress...';

    return `${statusText} • ${session.toolCallCount} tool call${session.toolCallCount !== 1 ? 's' : ''} • ${session.stageCount} stage${session.stageCount !== 1 ? 's' : ''}`;
  }
}
