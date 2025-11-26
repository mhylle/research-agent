import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
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

  /**
   * Submit a query and get logId immediately for SSE connection.
   * Returns the logId so the caller can connect to SSE right away.
   */
  async submitQuery(query: string): Promise<string | null> {
    this.isLoading.set(true);
    this.error.set(null);
    this.currentQuery.set(query);
    this.currentResult.set(null); // Clear previous result

    try {
      const requestBody: ResearchQuery = { query };
      // API now returns { logId } immediately (research runs in background)
      const response = await firstValueFrom(this.http.post<{ logId: string }>(
        `${environment.apiUrl}/research/query`,
        requestBody
      ));

      return response?.logId || null;
    } catch (err: any) {
      this.error.set(err.message || 'An error occurred');
      this.isLoading.set(false);
      return null;
    }
    // Note: isLoading will be set to false when SSE completes
  }

  /**
   * Called when research completes via SSE to store the result
   */
  setResult(result: ResearchResult): void {
    this.currentResult.set(result);
    this.history.update(prev => [result, ...prev].slice(0, 20));
    this.saveHistoryToStorage();
    this.isLoading.set(false);
  }

  /**
   * Called when research fails
   */
  setError(errorMessage: string): void {
    this.error.set(errorMessage);
    this.isLoading.set(false);
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

  /**
   * Retry a specific task within a research session
   * @param logId - The log ID of the research session
   * @param nodeId - The task/node ID to retry
   * @returns Observable with success status and message
   */
  retryTask(logId: string, nodeId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${environment.apiUrl}/research/retry/${logId}/${nodeId}`,
      {}
    );
  }
}
