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

    // Fixed URL to match backend route: /research/stream/:logId
    const url = `${environment.apiUrl}/research/stream/${logId}`;
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

    // NEW ORCHESTRATOR EVENT TYPES
    this.eventSource.addEventListener('session_started', (e: MessageEvent) => {
      this.handleSessionStarted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('plan_created', (e: MessageEvent) => {
      this.handlePlanCreated(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('phase_started', (e: MessageEvent) => {
      this.handlePhaseStarted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('phase_completed', (e: MessageEvent) => {
      this.handlePhaseCompleted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('phase_failed', (e: MessageEvent) => {
      this.handlePhaseFailed(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('step_started', (e: MessageEvent) => {
      this.handleStepStarted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('step_completed', (e: MessageEvent) => {
      this.handleStepCompleted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('step_failed', (e: MessageEvent) => {
      this.handleStepFailed(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('session_completed', (e: MessageEvent) => {
      this.handleSessionCompleted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('session_failed', (e: MessageEvent) => {
      this.handleSessionFailed(JSON.parse(e.data));
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

  // NEW ORCHESTRATOR EVENT HANDLERS
  private handleSessionStarted(event: any): void {
    console.log('Session started:', event);
  }

  private handlePlanCreated(event: any): void {
    console.log('Plan created:', event);
    // Map phases to stages (if needed, for now we'll use dynamic phase tracking)
  }

  private handlePhaseStarted(event: any): void {
    const { phaseId, phaseName, stepCount } = event;

    const newTask: ActivityTask = {
      id: phaseId,
      nodeId: phaseId,
      stage: 1, // We'll update this dynamically
      type: 'milestone',
      description: `Phase: ${phaseName} (${stepCount} steps)`,
      progress: 0,
      status: 'running',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };

    this.activeTasks.update(tasks => [...tasks, newTask]);
    this.updateStageProgress();
  }

  private handlePhaseCompleted(event: any): void {
    const { phaseId, stepsCompleted } = event;

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.id === phaseId);
      if (index >= 0) {
        const completedTask = {
          ...tasks[index],
          status: 'completed' as TaskStatus,
          progress: 100,
        };
        this.completedTasks.update(completed => [...completed, completedTask]);
        return tasks.filter((_, i) => i !== index);
      }
      return tasks;
    });

    this.updateStageProgress();
  }

  private handlePhaseFailed(event: any): void {
    const { phaseId, error } = event;

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.id === phaseId);
      if (index >= 0) {
        const updated = [...tasks];
        updated[index] = {
          ...updated[index],
          status: 'error' as TaskStatus,
          error: {
            message: error || 'Phase failed',
            timestamp: new Date(),
          },
          canRetry: true,
        };
        return updated;
      }
      return tasks;
    });
  }

  private handleStepStarted(event: any): void {
    const { stepId, toolName } = event;

    const newTask: ActivityTask = {
      id: stepId,
      nodeId: stepId,
      stage: 1, // Dynamic
      type: 'tool',
      description: `Running: ${toolName}`,
      progress: 0,
      status: 'running',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };

    this.activeTasks.update(tasks => [...tasks, newTask]);
  }

  private handleStepCompleted(event: any): void {
    const { stepId, toolName, durationMs } = event;

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.id === stepId);
      if (index >= 0) {
        const completedTask = {
          ...tasks[index],
          description: `Completed: ${toolName} (${durationMs}ms)`,
          status: 'completed' as TaskStatus,
          progress: 100,
        };
        this.completedTasks.update(completed => [...completed, completedTask]);
        return tasks.filter((_, i) => i !== index);
      }
      return tasks;
    });

    this.updateStageProgress();
  }

  private handleStepFailed(event: any): void {
    const { stepId, toolName, error } = event;

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.id === stepId);
      if (index >= 0) {
        const updated = [...tasks];
        updated[index] = {
          ...updated[index],
          description: `Failed: ${toolName}`,
          status: 'error' as TaskStatus,
          error: {
            message: error?.message || 'Step failed',
            timestamp: new Date(),
          },
          canRetry: true,
        };
        return updated;
      }
      return tasks;
    });
  }

  private handleSessionCompleted(event: any): void {
    console.log('Session completed:', event);
    this.isComplete.set(true);
  }

  private handleSessionFailed(event: any): void {
    console.log('Session failed:', event);
    const { error } = event;
    this.connectionError.set(error || 'Research failed');
  }

  private formatDescription(template: string, data: Record<string, unknown>): string {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
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
