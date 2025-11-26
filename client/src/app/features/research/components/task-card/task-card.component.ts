import { Component, input, output, signal } from '@angular/core';
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

  // State for expandable sections
  showDetails = signal<boolean>(false);

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

  /**
   * Toggle input/output details visibility
   */
  toggleDetails(): void {
    this.showDetails.update(v => !v);
  }

  /**
   * Check if task has displayable input/output data
   */
  hasDetails(): boolean {
    const t = this.task();

    // Check if input has content
    const hasInput = t.input && typeof t.input === 'object' && Object.keys(t.input).length > 0;

    // Check if output has content
    let hasOutput = false;
    if (t.output !== null && t.output !== undefined) {
      if (typeof t.output === 'string') {
        hasOutput = t.output.length > 0;
      } else if (Array.isArray(t.output)) {
        hasOutput = t.output.length > 0;
      } else if (typeof t.output === 'object') {
        hasOutput = Object.keys(t.output).length > 0;
      } else {
        // For primitives (numbers, booleans), always show
        hasOutput = true;
      }
    }

    return hasInput || hasOutput;
  }

  /**
   * Format JSON for display (pretty print)
   */
  formatJson(data: unknown): string {
    if (data === null || data === undefined) {
      return 'null';
    }
    if (typeof data === 'string') {
      // If it's a long string, truncate for preview
      if (data.length > 500) {
        return data.substring(0, 500) + '...';
      }
      return data;
    }
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  /**
   * Get a short preview of the input for collapsed view
   */
  getInputPreview(): string {
    const t = this.task();
    if (!t.input || typeof t.input !== 'object') return '';
    const keys = Object.keys(t.input);
    if (keys.length === 0) return '';
    if (keys.length <= 3) return keys.join(', ');
    return `${keys.slice(0, 3).join(', ')} +${keys.length - 3} more`;
  }

  /**
   * Get a short preview of the output for collapsed view
   */
  getOutputPreview(): string {
    const t = this.task();
    if (!t.output) return '';
    if (typeof t.output === 'string') {
      return t.output.length > 100 ? t.output.substring(0, 100) + '...' : t.output;
    }
    if (Array.isArray(t.output)) {
      return `Array with ${t.output.length} items`;
    }
    return 'Object';
  }
}
