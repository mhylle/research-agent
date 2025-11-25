import { Component, input, output, OnInit, OnDestroy, signal, effect, viewChild, ElementRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgentActivityService } from '../../../../core/services/agent-activity.service';
import { StageProgressHeaderComponent } from '../stage-progress-header/stage-progress-header';
import { TaskCardComponent } from '../task-card/task-card.component';
import { ActivityTask } from '../../../../models';

@Component({
  selector: 'app-agent-activity-view',
  standalone: true,
  imports: [CommonModule, StageProgressHeaderComponent, TaskCardComponent],
  templateUrl: './agent-activity-view.component.html',
  styleUrls: ['./agent-activity-view.component.scss']
})
export class AgentActivityViewComponent implements OnInit, OnDestroy {
  // Signal-based input for research log ID
  logId = input.required<string>();

  // Output event for retry button clicks
  retry = output<string>();

  // Local state for collapsible sections
  showCompletedTasks = signal<boolean>(false);

  // ViewChild for tasks container (for auto-scroll)
  tasksContainer = viewChild<ElementRef<HTMLDivElement>>('tasksContainer');

  // Expose readonly signals from service
  readonly currentStage = computed(() => this.activityService.currentStage());
  readonly stageProgress = computed(() => this.activityService.stageProgress());
  readonly activeTasks = computed(() => this.activityService.activeTasks());
  readonly completedTasks = computed(() => this.activityService.completedTasks());
  readonly isComplete = computed(() => this.activityService.isComplete());
  readonly isConnected = computed(() => this.activityService.isConnected());
  readonly connectionError = computed(() => this.activityService.connectionError());

  // Inject the AgentActivityService
  constructor(private activityService: AgentActivityService) {
    // Auto-scroll effect when new tasks appear
    // Effect is called in injection context (constructor)
    effect(() => {
      const activeTasks = this.activeTasks();
      if (activeTasks.length > 0) {
        this.scrollToBottom();
      }
    });
  }

  ngOnInit(): void {
    // Connect to SSE stream with the provided logId
    const id = this.logId();
    if (id) {
      this.activityService.connectToStream(id);
    }
  }

  ngOnDestroy(): void {
    // Disconnect from SSE stream when component is destroyed
    this.activityService.disconnect();
  }

  /**
   * Toggle completed tasks section visibility
   */
  toggleCompletedTasks(): void {
    this.showCompletedTasks.update(value => !value);
  }

  /**
   * Handle retry button click from TaskCard
   */
  handleRetry(taskId: string): void {
    this.retry.emit(taskId);
  }

  /**
   * Retry connection when error occurs
   */
  retryConnection(): void {
    const id = this.logId();
    if (id) {
      this.activityService.connectToStream(id);
    }
  }

  /**
   * TrackBy function for *ngFor optimization
   */
  trackByTaskId(index: number, task: ActivityTask): string {
    return task.id;
  }

  /**
   * Auto-scroll to bottom when new tasks appear
   */
  private scrollToBottom(): void {
    // Use ViewChild to safely access container
    const container = this.tasksContainer();
    if (container) {
      setTimeout(() => {
        const element = container.nativeElement;
        element.scrollTop = element.scrollHeight;
      }, 100);
    }
  }

  /**
   * Get chevron icon based on collapse state
   */
  getChevronIcon(): string {
    return this.showCompletedTasks() ? '▼' : '▶';
  }
}
