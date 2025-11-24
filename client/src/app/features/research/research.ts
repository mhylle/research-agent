import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResearchService } from '../../core/services/research.service';
import { SearchInputComponent } from './components/search-input/search-input';
import { LoadingIndicatorComponent } from './components/loading-indicator/loading-indicator';
import { ResultCardComponent } from './components/result-card/result-card';
import { ErrorMessageComponent } from './components/error-message/error-message';
import { AgentActivityViewComponent } from './components/agent-activity-view/agent-activity-view.component';

@Component({
  selector: 'app-research',
  standalone: true,
  imports: [
    CommonModule,
    SearchInputComponent,
    LoadingIndicatorComponent,
    ResultCardComponent,
    ErrorMessageComponent,
    AgentActivityViewComponent
  ],
  templateUrl: './research.html',
  styleUrl: './research.scss',
})
export class ResearchComponent {
  researchService = inject(ResearchService);

  // State for agent activity view integration
  currentLogId = signal<string | null>(null);

  // Show activity view if we have a logId (after research completes)
  showActivityView = computed(() => this.currentLogId() !== null);

  // Show current result with activity view
  showAnswer = computed(() =>
    this.currentLogId() !== null && this.researchService.currentResult() !== null
  );

  async onQuerySubmitted(query: string): Promise<void> {
    // Clear previous logId and result before new research
    this.currentLogId.set(null);

    try {
      // Submit query - this will complete when research is done
      await this.researchService.submitQuery(query);

      // Extract logId from result
      // Note: Currently the API returns logId after research completes
      // When SSE is implemented, we'll receive logId immediately and can
      // show real-time progress during research
      const result = this.researchService.currentResult();
      if (result?.logId) {
        this.currentLogId.set(result.logId);
      }
    } catch (error) {
      // Error handling is done by ResearchService
      console.error('Research query failed:', error);
    }
  }

  onRetry(): void {
    const lastQuery = this.researchService.currentQuery();
    if (lastQuery) {
      this.onQuerySubmitted(lastQuery);
    }
  }

  onDismissError(): void {
    this.researchService.clearError();
  }

  /**
   * Handle retry event from AgentActivityView
   * @param taskId - The ID of the task to retry
   */
  handleTaskRetry(taskId: string): void {
    console.log('Retry requested for task:', taskId);
    // For now, retry the entire query
    // Future enhancement: implement per-task retry logic
    this.onRetry();
  }
}
