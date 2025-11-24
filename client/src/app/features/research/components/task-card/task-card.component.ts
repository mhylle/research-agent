import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityTask, TaskStatus, TaskType } from '../../../../models/activity-task.model';

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-card.component.html',
  styleUrls: ['./task-card.component.scss']
})
export class TaskCardComponent {
  // Signal-based input for task data
  task = input.required<ActivityTask>();

  // Output event for retry button
  retry = output<string>();

  /**
   * Get CSS class based on task status
   */
  getStatusClass(): string {
    const status = this.task().status;
    return `task-card--${status}`;
  }

  /**
   * Get appropriate icon based on task status and type
   */
  getStatusIcon(): string {
    const task = this.task();

    // Status-based icons take precedence
    switch (task.status) {
      case 'completed':
        return '✓';
      case 'error':
        return '⚠️';
      case 'retrying':
        return '↻';
      case 'pending':
        return '⏳';
      case 'running':
        // For running tasks, check the description for type-specific icons
        return this.getTypeIcon(task);
      default:
        return '🔄';
    }
  }

  /**
   * Get type-specific icon based on task description
   */
  private getTypeIcon(task: ActivityTask): string {
    const desc = task.description.toLowerCase();

    if (desc.includes('search') || desc.includes('searching')) {
      return '🔍';
    } else if (desc.includes('fetch') || desc.includes('fetching')) {
      return '🌐';
    } else if (desc.includes('filter') || desc.includes('filtering')) {
      return '📊';
    } else if (desc.includes('analyz') || desc.includes('synthesiz') ||
               desc.includes('generat')) {
      return '🤖';
    } else {
      return '🔄';
    }
  }

  /**
   * Get CSS class for progress bar color
   */
  getProgressBarClass(): string {
    const status = this.task().status;
    return `progress-bar--${status}`;
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(date: Date): string {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }

    // Validate date
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);

    if (seconds < 60) {
      return 'just now';
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m ago`;
    } else {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  /**
   * Format duration in milliseconds to human-readable string
   */
  formatDuration(ms: number | undefined): string {
    if (ms === undefined) {
      return '';
    }
    const seconds = Math.floor(ms / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0
        ? `${minutes}m ${remainingSeconds}s`
        : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0
        ? `${hours}h ${minutes}m`
        : `${hours}h`;
    }
  }

  /**
   * Handle retry button click
   */
  onRetryClick(): void {
    this.retry.emit(this.task().id);
  }

  /**
   * Check if progress bar should be shown
   */
  shouldShowProgress(): boolean {
    const status = this.task().status;
    return status === 'running' || status === 'completed' || status === 'retrying';
  }

  /**
   * Get progress percentage as integer
   */
  getProgressPercentage(): number {
    return Math.round(this.task().progress);
  }
}
