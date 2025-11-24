import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResearchService } from '../../core/services/research.service';
import { SearchInputComponent } from './components/search-input/search-input';
import { LoadingIndicatorComponent } from './components/loading-indicator/loading-indicator';
import { ResultCardComponent } from './components/result-card/result-card';
import { ErrorMessageComponent } from './components/error-message/error-message';
import { AgentActivityViewComponent } from './components/agent-activity-view/agent-activity-view.component';
import { ResearchHistoryComponent } from './components/research-history/research-history.component';

@Component({
  selector: 'app-research',
  standalone: true,
  imports: [
    CommonModule,
    SearchInputComponent,
    LoadingIndicatorComponent,
    ResultCardComponent,
    ErrorMessageComponent,
    AgentActivityViewComponent,
    ResearchHistoryComponent
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
    const logId = this.currentLogId();

    if (!logId) {
      console.error('Cannot retry task: No logId available');
      return;
    }

    console.log('Initiating retry for task:', taskId, 'in log:', logId);

    // Call the retry API
    this.researchService.retryTask(logId, taskId).subscribe({
      next: (response) => {
        // Success - SSE will automatically update the UI with retry status
        console.log('✅ Retry initiated successfully:', response.message);
        // The AgentActivityService will receive SSE events and update the UI
      },
      error: (error) => {
        // Handle different error scenarios
        const errorMessage = error.error?.message || error.message || 'Failed to retry task';
        const statusCode = error.status;

        console.error('❌ Retry failed:', errorMessage, 'Status:', statusCode);

        // Log specific error types for debugging
        if (statusCode === 404) {
          console.error('Task or log not found. LogId:', logId, 'TaskId:', taskId);
        } else if (statusCode === 400) {
          console.error('Task is not in a retryable state or max retries exceeded');
        } else if (statusCode === 500) {
          console.error('Server error during retry execution');
        }

        // TODO: Show user-friendly error message via toast/snackbar service
        // For now, error is logged to console for debugging
      }
    });
  }
}
