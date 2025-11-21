import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogSession } from '../../../../models';

@Component({
  selector: 'app-logs-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './logs-list.html',
  styleUrls: ['./logs-list.scss']
})
export class LogsListComponent {
  @Input() sessions: LogSession[] = [];
  @Input() selectedLogId: string | null = null;
  @Input() isLoading = false;
  @Output() sessionSelected = new EventEmitter<string>();
  @Output() searchChanged = new EventEmitter<string>();

  searchTerm = '';

  onSearchChange(): void {
    this.searchChanged.emit(this.searchTerm);
  }

  selectSession(logId: string): void {
    this.sessionSelected.emit(logId);
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  getStatusIcon(status: string): string {
    const icons = {
      'completed': '✅',
      'error': '❌',
      'incomplete': '⏳'
    };
    return icons[status] || '📋';
  }

  truncateLogId(logId: string): string {
    if (logId.length <= 16) return logId;
    return `...${logId.slice(-12)}`;
  }
}
