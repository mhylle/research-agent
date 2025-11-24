import { Injectable, signal, computed } from '@angular/core';
import { ActivityTask, MilestoneEventData, TaskStatus, TaskType } from '../../models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AgentActivityService {
  // Signals for reactive state
  currentStage = signal<number>(1);
  activeTasks = signal<ActivityTask[]>([]);
  completedTasks = signal<ActivityTask[]>([]);
  stageProgress = signal<number>(0);
  isComplete = signal<boolean>(false);
  isConnected = signal<boolean>(false);
  connectionError = signal<string | null>(null);

  // Computed signals
  allTasks = computed(() => [...this.activeTasks(), ...this.completedTasks()]);
  hasActiveTasks = computed(() => this.activeTasks().length > 0);
  hasErrors = computed(() =>
    this.activeTasks().some(t => t.status === 'error')
  );

  private eventSource: EventSource | null = null;
  private currentLogId: string | null = null;

  connectToStream(logId: string): void {
    // Close existing connection
    this.disconnect();

    this.currentLogId = logId;
    this.resetState();

    const url = `${environment.apiUrl}/research/stream/events/${logId}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.isConnected.set(true);
      this.connectionError.set(null);
    };

    this.eventSource.onerror = () => {
      this.isConnected.set(false);
      this.connectionError.set('Connection lost. Reconnecting...');
      // EventSource auto-reconnects, so just update status
    };

    // Listen for different event types
    this.eventSource.addEventListener('node-start', (e: MessageEvent) => {
      this.handleTaskStart(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('node-milestone', (e: MessageEvent) => {
      this.handleMilestone(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('node-progress', (e: MessageEvent) => {
      this.handleProgress(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('node-complete', (e: MessageEvent) => {
      this.handleTaskComplete(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('node-error', (e: MessageEvent) => {
      this.handleTaskError(JSON.parse(e.data));
    });
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected.set(false);
    }
    this.currentLogId = null;
  }

  private resetState(): void {
    this.currentStage.set(1);
    this.activeTasks.set([]);
    this.completedTasks.set([]);
    this.stageProgress.set(0);
    this.isComplete.set(false);
    this.connectionError.set(null);
  }

  private handleTaskStart(event: MilestoneEventData): void {
    // Tool/stage starts - create placeholder task if needed
    const existingTask = this.activeTasks().find(t => t.nodeId === event.nodeId);

    if (!existingTask) {
      const newTask: ActivityTask = {
        id: `task_${event.nodeId}`,
        nodeId: event.nodeId,
        stage: this.currentStage() as 1 | 2 | 3,
        type: (event.nodeType as TaskType) || 'tool',
        description: (event.data?.['description'] as string) || 'Processing...',
        progress: 0,
        status: 'running',
        timestamp: new Date(event.timestamp),
        retryCount: 0,
        canRetry: false,
      };

      this.activeTasks.update(tasks => [...tasks, newTask]);
    }
  }

  private handleMilestone(event: MilestoneEventData): void {
    if (!event.milestone) return;

    const milestone = event.milestone;
    const taskId = milestone.milestoneId;

    // Check if task already exists
    const existingTaskIndex = this.activeTasks().findIndex(t => t.id === taskId);

    if (existingTaskIndex >= 0) {
      // Update existing task
      this.activeTasks.update(tasks => {
        const updated = [...tasks];
        updated[existingTaskIndex] = {
          ...updated[existingTaskIndex],
          description: this.formatDescription(milestone.template, milestone.data),
          progress: milestone.progress,
          status: milestone.status as TaskStatus,
        };
        return updated;
      });
    } else {
      // Create new task
      const newTask: ActivityTask = {
        id: taskId,
        nodeId: event.nodeId,
        stage: milestone.stage,
        type: 'milestone',
        description: this.formatDescription(milestone.template, milestone.data),
        progress: milestone.progress,
        status: milestone.status as TaskStatus,
        timestamp: new Date(milestone.timestamp),
        retryCount: 0,
        canRetry: false,
        data: milestone.data,
      };

      this.activeTasks.update(tasks => [...tasks, newTask]);
    }

    // Update current stage
    if (milestone.stage !== this.currentStage()) {
      this.currentStage.set(milestone.stage);
    }

    // Calculate stage progress
    this.updateStageProgress();
  }

  private handleProgress(event: MilestoneEventData): void {
    const nodeId = event.nodeId;

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.nodeId === nodeId);
      if (index >= 0) {
        const updated = [...tasks];
        updated[index] = {
          ...updated[index],
          progress: (event.data?.['progress'] as number) || updated[index].progress,
        };
        return updated;
      }
      return tasks;
    });

    this.updateStageProgress();
  }

  private handleTaskComplete(event: MilestoneEventData): void {
    const nodeId = event.nodeId;

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.nodeId === nodeId);
      if (index >= 0) {
        const completed = {
          ...tasks[index],
          status: 'completed' as TaskStatus,
          progress: 100,
        };

        // Move to completed tasks
        this.completedTasks.update(completedTasks => [...completedTasks, completed]);

        // Remove from active
        return tasks.filter((_, i) => i !== index);
      }
      return tasks;
    });

    // Check if all stages complete
    if (this.currentStage() === 3 && this.activeTasks().length === 0) {
      this.isComplete.set(true);
    }

    this.updateStageProgress();
  }

  private handleTaskError(event: MilestoneEventData): void {
    const nodeId = event.nodeId;

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.nodeId === nodeId);
      if (index >= 0) {
        const updated = [...tasks];
        const errorData = event.data?.['error'] as { message?: string; code?: string } | undefined;
        updated[index] = {
          ...updated[index],
          status: 'error' as TaskStatus,
          error: {
            message: errorData?.message || 'Unknown error',
            code: errorData?.code,
            timestamp: new Date(),
          },
          canRetry: true,
        };
        return updated;
      }
      return tasks;
    });
  }

  private formatDescription(template: string, data: Record<string, unknown>): string {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(`{${key}}`, String(value));
    }
    return result;
  }

  private updateStageProgress(): void {
    const tasks = this.activeTasks();
    if (tasks.length === 0) {
      this.stageProgress.set(100);
      return;
    }

    const totalProgress = tasks.reduce((sum, task) => sum + task.progress, 0);
    const avgProgress = totalProgress / tasks.length;
    this.stageProgress.set(Math.round(avgProgress));
  }
}
