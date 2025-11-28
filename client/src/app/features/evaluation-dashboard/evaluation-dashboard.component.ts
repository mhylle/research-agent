import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EvaluationApiService } from '../../core/services/evaluation-api.service';
import { EvaluationStatsComponent } from './evaluation-stats.component';
import { EvaluationListComponent } from './evaluation-list.component';
import {
  EvaluationStats,
  EvaluationFilters,
  PaginationParams,
  PaginatedEvaluations
} from '../../models/evaluation-record.model';

@Component({
  selector: 'app-evaluation-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, EvaluationStatsComponent, EvaluationListComponent],
  templateUrl: './evaluation-dashboard.component.html',
  styleUrls: ['./evaluation-dashboard.component.scss']
})
export class EvaluationDashboardComponent implements OnInit {
  private evaluationApi = inject(EvaluationApiService);

  // State signals
  protected stats = signal<EvaluationStats | null>(null);
  protected evaluations = signal<PaginatedEvaluations | null>(null);
  protected isLoadingStats = signal(false);
  protected isLoadingRecords = signal(false);
  protected error = signal<string | null>(null);

  // Filter and pagination state
  protected filters = signal<EvaluationFilters>({
    status: 'all',
    phase: 'all'
  });
  protected pagination = signal<PaginationParams>({
    page: 1,
    limit: 10
  });

  // Computed signals
  protected hasData = computed(() => {
    const stats = this.stats();
    return stats && stats.totalRecords > 0;
  });

  protected isLoading = computed(() =>
    this.isLoadingStats() || this.isLoadingRecords()
  );

  ngOnInit(): void {
    this.loadStats();
    this.loadRecords();
  }

  protected handleFilterChange(filters: EvaluationFilters): void {
    this.filters.set(filters);
    this.pagination.update(p => ({ ...p, page: 1 }));
    this.loadRecords();
  }

  protected handlePageChange(page: number): void {
    this.pagination.update(p => ({ ...p, page }));
    this.loadRecords();
  }

  protected refreshData(): void {
    this.loadStats();
    this.loadRecords();
  }

  private loadStats(): void {
    this.isLoadingStats.set(true);
    this.error.set(null);

    this.evaluationApi.getStats().subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.isLoadingStats.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load statistics: ' + err.message);
        this.isLoadingStats.set(false);
      }
    });
  }

  private loadRecords(): void {
    this.isLoadingRecords.set(true);
    this.error.set(null);

    this.evaluationApi.getRecords(this.pagination(), this.filters()).subscribe({
      next: (data) => {
        this.evaluations.set(data);
        this.isLoadingRecords.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load records: ' + err.message);
        this.isLoadingRecords.set(false);
      }
    });
  }
}
