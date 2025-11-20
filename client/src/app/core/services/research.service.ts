import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ResearchQuery, ResearchResult } from '../../models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ResearchService {
  // Signals for reactive state
  currentQuery = signal<string>('');
  isLoading = signal<boolean>(false);
  currentResult = signal<ResearchResult | null>(null);
  error = signal<string | null>(null);
  history = signal<ResearchResult[]>([]);

  // Computed signals
  hasResults = computed(() => this.history().length > 0);
  canSubmit = computed(() =>
    this.currentQuery().trim().length >= 3 && !this.isLoading()
  );

  constructor(private http: HttpClient) {
    this.loadHistoryFromStorage();
  }

  async submitQuery(query: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    this.currentQuery.set(query);

    try {
      const requestBody: ResearchQuery = { query };
      const result = await firstValueFrom(this.http.post<Omit<ResearchResult, 'query' | 'timestamp'>>(
        `${environment.apiUrl}/research/query`,
        requestBody
      ));

      if (result) {
        const fullResult: ResearchResult = {
          ...result,
          query,
          timestamp: new Date()
        };

        this.currentResult.set(fullResult);
        this.history.update(prev => [fullResult, ...prev].slice(0, 20));
        this.saveHistoryToStorage();
      }
    } catch (err: any) {
      this.error.set(err.message || 'An error occurred');
    } finally {
      this.isLoading.set(false);
    }
  }

  clearError(): void {
    this.error.set(null);
  }

  private loadHistoryFromStorage(): void {
    try {
      const stored = localStorage.getItem('research_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.history.set(parsed.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp)
        })));
      }
    } catch (err) {
      console.error('Failed to load history from storage', err);
    }
  }

  private saveHistoryToStorage(): void {
    try {
      localStorage.setItem('research_history', JSON.stringify(this.history()));
    } catch (err) {
      console.error('Failed to save history to storage', err);
    }
  }
}
