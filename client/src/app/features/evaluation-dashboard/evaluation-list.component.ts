import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  PaginatedEvaluations,
  EvaluationFilters,
  EvaluationRecord,
} from '../../models/evaluation-record.model';

@Component({
  selector: 'app-evaluation-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe],
  template: `
    <div class="evaluation-list">
      <div class="list-header">
        <h2>Evaluation Records</h2>
        <div class="filters">
          <select
            [ngModel]="statusFilter()"
            (ngModelChange)="onStatusChange($event)"
            class="filter-select"
          >
            <option value="all">All Status</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      @if (isLoading) {
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading records...</p>
        </div>
      } @else if (records().length === 0) {
        <div class="empty-state">
          <span class="icon">📋</span>
          <p>No evaluation records found</p>
        </div>
      } @else {
        <div class="records-table">
          <table>
            <thead>
              <tr>
                <th>Query</th>
                <th>Status</th>
                <th>Score</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (record of records(); track record.id) {
                <tr [class.passed]="record.passed" [class.failed]="!record.passed">
                  <td class="query-cell">
                    <span class="query-text">{{ record.query }}</span>
                  </td>
                  <td>
                    <span class="status-badge" [class.passed]="record.passed" [class.failed]="!record.passed">
                      {{ record.passed ? 'Passed' : 'Failed' }}
                    </span>
                  </td>
                  <td class="score-cell">
                    @if (record.evaluations && record.evaluations.length > 0) {
                      {{ getAverageScore(record) | number:'1.0-0' }}%
                    } @else {
                      N/A
                    }
                  </td>
                  <td class="date-cell">
                    {{ record.timestamp | date:'short' }}
                  </td>
                  <td class="actions-cell">
                    <a [routerLink]="['/evaluation-dashboard', record.id]" class="view-btn">
                      View Details
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (evaluations && evaluations.totalPages > 1) {
          <div class="pagination">
            <button
              class="page-btn"
              [disabled]="currentPage <= 1"
              (click)="onPageChange(currentPage - 1)"
            >
              Previous
            </button>
            <span class="page-info">
              Page {{ currentPage }} of {{ evaluations.totalPages }}
            </span>
            <button
              class="page-btn"
              [disabled]="currentPage >= evaluations.totalPages"
              (click)="onPageChange(currentPage + 1)"
            >
              Next
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .evaluation-list {
      background: var(--surface-color, #fff);
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .list-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .filters {
      display: flex;
      gap: 0.5rem;
    }

    .filter-select {
      padding: 0.5rem;
      border: 1px solid var(--border-color, #ddd);
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .loading, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
      color: var(--text-secondary, #666);
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border-color, #ddd);
      border-top-color: var(--primary-color, #3b82f6);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-state .icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .records-table {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border-color, #e5e7eb);
    }

    th {
      background: var(--surface-secondary, #f9fafb);
      font-weight: 600;
      color: var(--text-secondary, #6b7280);
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }

    tr:hover {
      background: var(--hover-color, #f9fafb);
    }

    .query-cell {
      max-width: 300px;
    }

    .query-text {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status-badge.passed {
      background: var(--success-bg, #dcfce7);
      color: var(--success-color, #166534);
    }

    .status-badge.failed {
      background: var(--error-bg, #fee2e2);
      color: var(--error-color, #991b1b);
    }

    .score-cell {
      font-weight: 500;
    }

    .date-cell {
      color: var(--text-secondary, #6b7280);
    }

    .actions-cell {
      text-align: right;
    }

    .view-btn {
      color: var(--primary-color, #3b82f6);
      text-decoration: none;
      font-weight: 500;
    }

    .view-btn:hover {
      text-decoration: underline;
    }

    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-color, #e5e7eb);
    }

    .page-btn {
      padding: 0.5rem 1rem;
      border: 1px solid var(--border-color, #ddd);
      border-radius: 4px;
      background: var(--surface-color, #fff);
      cursor: pointer;
    }

    .page-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .page-btn:not(:disabled):hover {
      background: var(--hover-color, #f9fafb);
    }

    .page-info {
      color: var(--text-secondary, #6b7280);
      font-size: 0.875rem;
    }
  `],
})
export class EvaluationListComponent {
  @Input() evaluations: PaginatedEvaluations | null = null;
  @Input() isLoading = false;
  @Input() currentPage = 1;

  @Output() filterChange = new EventEmitter<EvaluationFilters>();
  @Output() pageChange = new EventEmitter<number>();

  protected statusFilter = signal<'all' | 'passed' | 'failed'>('all');

  protected records = computed(() => {
    return this.evaluations?.records ?? [];
  });

  protected onStatusChange(status: 'all' | 'passed' | 'failed'): void {
    this.statusFilter.set(status);
    this.filterChange.emit({ status });
  }

  protected onPageChange(page: number): void {
    this.pageChange.emit(page);
  }

  protected getAverageScore(record: EvaluationRecord): number {
    if (!record.evaluations || record.evaluations.length === 0) {
      return 0;
    }

    const scores = record.evaluations
      .filter((e) => e.scores)
      .flatMap((e) => Object.values(e.scores || {}))
      .filter((s): s is number => typeof s === 'number');

    if (scores.length === 0) return 0;
    return (scores.reduce((a, b) => a + b, 0) / scores.length) * 100;
  }
}
