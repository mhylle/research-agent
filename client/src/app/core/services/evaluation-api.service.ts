import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  EvaluationRecord,
  EvaluationStats,
  EvaluationFilters,
  PaginationParams,
  PaginatedEvaluations
} from '../../models/evaluation-record.model';

@Injectable({
  providedIn: 'root'
})
export class EvaluationApiService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/evaluation`;

  /**
   * Get paginated evaluation records with optional filters
   */
  getRecords(
    pagination: PaginationParams,
    filters?: EvaluationFilters
  ): Observable<PaginatedEvaluations> {
    let params = new HttpParams()
      .set('page', pagination.page.toString())
      .set('limit', pagination.limit.toString());

    if (filters) {
      if (filters.status && filters.status !== 'all') {
        params = params.set('status', filters.status);
      }
      if (filters.phase && filters.phase !== 'all') {
        params = params.set('phase', filters.phase);
      }
      if (filters.dateFrom) {
        params = params.set('dateFrom', filters.dateFrom);
      }
      if (filters.dateTo) {
        params = params.set('dateTo', filters.dateTo);
      }
      if (filters.searchQuery) {
        params = params.set('search', filters.searchQuery);
      }
    }

    return this.http.get<PaginatedEvaluations>(`${this.apiUrl}/records`, { params });
  }

  /**
   * Get a single evaluation record by ID
   */
  getRecordById(id: string): Observable<EvaluationRecord> {
    return this.http.get<EvaluationRecord>(`${this.apiUrl}/records/${id}`);
  }

  /**
   * Get evaluation statistics
   */
  getStats(): Observable<EvaluationStats> {
    return this.http.get<EvaluationStats>(`${this.apiUrl}/stats`);
  }
}
