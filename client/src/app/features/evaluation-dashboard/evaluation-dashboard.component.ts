import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { EvaluationApiService } from '../../core/services/evaluation-api.service';
import { EvaluationStatsComponent } from './evaluation-stats.component';
import { EvaluationListComponent } from './evaluation-list.component';
import {
  EvaluationStats,
  EvaluationFilters,
  PaginationParams,
  PaginatedEvaluations,
  EvaluationRecord
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
  private route = inject(ActivatedRoute);

  // State signals
  protected stats = signal<EvaluationStats | null>(null);
  protected evaluations = signal<PaginatedEvaluations | null>(null);
  protected selectedEvaluation = signal<EvaluationRecord | null>(null);
  protected isLoadingStats = signal(false);
  protected isLoadingRecords = signal(false);
  protected isLoadingDetail = signal(false);
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

  // View mode
  protected viewMode = computed(() =>
    this.selectedEvaluation() ? 'detail' : 'list'
  );

  // Computed signals
  protected hasData = computed(() => {
    const stats = this.stats();
    return stats && stats.totalRecords > 0;
  });

  protected isLoading = computed(() =>
    this.isLoadingStats() || this.isLoadingRecords() || this.isLoadingDetail()
  );

  ngOnInit(): void {
    // Check if we have an ID parameter
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadDetail(id);
    } else {
      this.loadStats();
      this.loadRecords();
    }
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

  private loadDetail(id: string): void {
    this.isLoadingDetail.set(true);
    this.error.set(null);

    this.evaluationApi.getRecordById(id).subscribe({
      next: (record) => {
        this.selectedEvaluation.set(record);
        this.isLoadingDetail.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load evaluation details: ' + err.message);
        this.isLoadingDetail.set(false);
      }
    });
  }

  protected backToList(): void {
    this.selectedEvaluation.set(null);
  }
}
