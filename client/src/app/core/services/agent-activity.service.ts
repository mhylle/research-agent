import { Injectable, signal, computed } from '@angular/core';
import { ActivityTask, MilestoneEventData, TaskStatus } from '../../models';
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
    // Implementation in next task
  }

  private handleMilestone(event: MilestoneEventData): void {
    // Implementation in next task
  }

  private handleProgress(event: MilestoneEventData): void {
    // Implementation in next task
  }

  private handleTaskComplete(event: MilestoneEventData): void {
    // Implementation in next task
  }

  private handleTaskError(event: MilestoneEventData): void {
    // Implementation in next task
  }
}
