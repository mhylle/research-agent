import { Component, EventEmitter, Output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogsService } from '../../../../core/services/logs.service';
import { LogSession } from '../../../../models';

@Component({
  selector: 'app-session-picker',
  imports: [CommonModule, FormsModule],
  templateUrl: './session-picker.html',
  styleUrls: ['./session-picker.scss']
})
export class SessionPickerComponent {
  @Output() sessionSelected = new EventEmitter<string>();
  @Output() closeModal = new EventEmitter<void>();

  logsService = inject(LogsService);
  searchTerm = '';

  filteredSessions = computed(() => {
    const sessions = this.logsService.sessions();
    const search = this.searchTerm.toLowerCase();

    if (!search) {
      return sessions.slice(0, 20); // Limit to 20 most recent
    }

    return sessions
      .filter(s =>
        s.query.toLowerCase().includes(search) ||
        s.logId.includes(search)
      )
      .slice(0, 20);
  });

  selectSession(logId: string): void {
    this.sessionSelected.emit(logId);
    this.closeModal.emit();
  }

  close(): void {
    this.closeModal.emit();
  }

  formatDate(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  calculateOverallScore(session: LogSession): number {
    // Calculate a simple overall score based on status
    // This is a placeholder - in real implementation you'd extract actual scores
    if (session.status === 'completed') {
      return 75 + Math.random() * 25; // 75-100 for completed
    } else {
      return 30 + Math.random() * 40; // 30-70 for errors
    }
  }
}
