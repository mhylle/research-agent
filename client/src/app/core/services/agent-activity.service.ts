import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ActivityTask, MilestoneEventData, MilestoneTask, TaskStatus, TaskType, ResearchResult, EvaluationResult } from '../../models';
import { environment } from '../../../environments/environment';

// Interface for planned phases from plan_created event
export interface PlannedPhase {
  id: string;
  name: string;
  description: string;
  status: string;
  order: number;
  replanCheckpoint: boolean;
  totalSteps: number;
  steps: PlannedStep[];
}

export interface PlannedStep {
  id: string;
  toolName: string;
  type: string;
  config: Record<string, unknown>;
  dependencies: string[];
  status: string;
  order: number;
}

@Injectable({
  providedIn: 'root'
})
export class AgentActivityService {
  private http = inject(HttpClient);

  // Signals for reactive state
  currentStage = signal<number>(0); // Start at 0 for planning
  totalPhases = signal<number>(3); // Dynamic total phases
  currentPhaseName = signal<string>('Planning'); // Current phase name for display
  activeTasks = signal<ActivityTask[]>([]);
  completedTasks = signal<ActivityTask[]>([]);
  stageProgress = signal<number>(0);
  isComplete = signal<boolean>(false);
  isConnected = signal<boolean>(false);
  connectionError = signal<string | null>(null);
  researchResult = signal<ResearchResult | null>(null); // Final result when complete

  // Planning phase signals
  isPlanning = signal<boolean>(false);
  planningIteration = signal<{ current: number; max: number } | null>(null);
  plannedPhases = signal<PlannedPhase[]>([]); // Full plan structure
  planQuery = signal<string>('');

  // Milestone signals for granular progress feedback
  currentMilestone = signal<MilestoneTask | null>(null);
  milestoneHistory = signal<MilestoneTask[]>([]);

  // Evaluation signals
  planEvaluation = signal<EvaluationResult | null>(null);
  retrievalEvaluation = signal<EvaluationResult | null>(null);
  answerEvaluation = signal<EvaluationResult | null>(null);

  // Reasoning events signal
  reasoningEvents = signal<any[]>([]);

  // Confidence result signal
  confidenceResult = signal<any | null>(null);

  private phaseCounter = 0; // Track current phase index

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

    // Debug: Log ALL incoming messages to diagnose event routing
    this.eventSource.onmessage = (e: MessageEvent) => {
      console.log('SSE generic message received:', e.type, e.data);
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

    // Planning phase events
    this.eventSource.addEventListener('phase_added', (e: MessageEvent) => {
      this.handlePhaseAdded(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('step_added', (e: MessageEvent) => {
      this.handleStepAdded(JSON.parse(e.data));
    });

    // Planning phase events (LLM thinking)
    this.eventSource.addEventListener('planning_started', (e: MessageEvent) => {
      this.handlePlanningStarted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('planning_iteration', (e: MessageEvent) => {
      this.handlePlanningIteration(JSON.parse(e.data));
    });

    // Decomposed query synthesis events
    this.eventSource.addEventListener('final_synthesis_started', (e: MessageEvent) => {
      this.handleFinalSynthesisStarted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('final_synthesis_completed', (e: MessageEvent) => {
      this.handleFinalSynthesisCompleted(JSON.parse(e.data));
    });

    // Milestone events for granular progress feedback
    this.eventSource.addEventListener('milestone_started', (e: MessageEvent) => {
      this.handleMilestoneEvent(JSON.parse(e.data), 'started');
    });

    this.eventSource.addEventListener('milestone_progress', (e: MessageEvent) => {
      this.handleMilestoneEvent(JSON.parse(e.data), 'progress');
    });

    this.eventSource.addEventListener('milestone_completed', (e: MessageEvent) => {
      this.handleMilestoneEvent(JSON.parse(e.data), 'completed');
    });

    // Evaluation events
    console.log('🔍 [EVALUATION] Registering evaluation event listeners');
    this.eventSource.addEventListener('evaluation_started', (e: MessageEvent) => {
      console.log('🔍 [EVALUATION] evaluation_started SSE event received');
      this.handleEvaluationStarted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('evaluation_completed', (e: MessageEvent) => {
      console.log('🔍 [EVALUATION] evaluation_completed SSE event received');
      this.handleEvaluationCompleted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('evaluation_failed', (e: MessageEvent) => {
      console.log('🔍 [EVALUATION] evaluation_failed SSE event received');
      this.handleEvaluationFailed(JSON.parse(e.data));
    });

    // Reasoning events
    this.eventSource.addEventListener('reasoning_thought', (e: MessageEvent) => {
      this.handleReasoningEvent(JSON.parse(e.data), 'thought');
    });

    this.eventSource.addEventListener('reasoning_action_planned', (e: MessageEvent) => {
      this.handleReasoningEvent(JSON.parse(e.data), 'action_planned');
    });

    this.eventSource.addEventListener('reasoning_observation', (e: MessageEvent) => {
      this.handleReasoningEvent(JSON.parse(e.data), 'observation');
    });

    this.eventSource.addEventListener('reasoning_conclusion', (e: MessageEvent) => {
      this.handleReasoningEvent(JSON.parse(e.data), 'conclusion');
    });

    // Confidence scoring events
    this.eventSource.addEventListener('confidence_scoring_started', (e: MessageEvent) => {
      this.handleConfidenceScoringStarted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('confidence_scoring_completed', (e: MessageEvent) => {
      this.handleConfidenceScoringCompleted(JSON.parse(e.data));
    });

    this.eventSource.addEventListener('confidence_scoring_failed', (e: MessageEvent) => {
      this.handleConfidenceScoringFailed(JSON.parse(e.data));
    });
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected.set(false);
    }
    this.currentLogId = null;
    // Reset state to ensure clean slate when navigating away
    this.resetState();
  }

  /**
   * Public method to reset all state signals to initial values.
   * Call this when navigating away from active research or starting new research.
   */
  public clearState(): void {
    this.resetState();
  }

  private resetState(): void {
    this.currentStage.set(0); // Start at 0 for planning phase
    this.totalPhases.set(3);
    this.currentPhaseName.set('Planning');
    this.phaseCounter = 0;
    this.activeTasks.set([]);
    this.completedTasks.set([]);
    this.stageProgress.set(0);
    this.isComplete.set(false);
    this.connectionError.set(null);
    this.researchResult.set(null);
    // Reset planning state
    this.isPlanning.set(false);
    this.planningIteration.set(null);
    this.plannedPhases.set([]);
    this.planQuery.set('');
    // Reset milestone state
    this.currentMilestone.set(null);
    this.milestoneHistory.set([]);
    // Reset evaluation state
    this.planEvaluation.set(null);
    this.retrievalEvaluation.set(null);
    this.answerEvaluation.set(null);
    // Reset reasoning events
    this.reasoningEvents.set([]);
    // Reset confidence
    this.confidenceResult.set(null);
  }

  // NEW ORCHESTRATOR EVENT HANDLERS
  private handleSessionStarted(event: any): void {
    console.log('Session started:', event);
    // Show we're starting research
    this.currentStage.set(0);
    this.isPlanning.set(true);
  }

  private handlePlanningStarted(event: any): void {
    console.log('Planning started:', event);
    this.isPlanning.set(true);
    this.currentStage.set(0); // Stage 0 = Planning

    // Create a planning task to show in the UI
    const planningTask: ActivityTask = {
      id: 'planning-llm',
      nodeId: 'planning',
      stage: 1,
      type: 'milestone',
      description: '🤔 Planning research strategy...',
      progress: 0,
      status: 'running',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };
    this.activeTasks.update(tasks => [...tasks, planningTask]);
  }

  private handlePlanningIteration(event: any): void {
    console.log('Planning iteration:', event);
    const { iteration, maxIterations } = event;

    this.planningIteration.set({ current: iteration, max: maxIterations });

    // Update the planning task progress
    this.activeTasks.update(tasks => {
      const planningIdx = tasks.findIndex(t => t.id === 'planning-llm');
      if (planningIdx >= 0) {
        const updated = [...tasks];
        const progress = Math.round((iteration / maxIterations) * 100);
        updated[planningIdx] = {
          ...updated[planningIdx],
          description: `🤔 Planning iteration ${iteration}/${maxIterations}...`,
          progress,
        };
        return updated;
      }
      return tasks;
    });
  }

  private handleFinalSynthesisStarted(event: any): void {
    console.log('Final synthesis started:', event);
    const { phaseId, subQueryCount } = event;

    // Increment phase counter for synthesis phase
    this.phaseCounter++;
    this.currentStage.set(this.phaseCounter);
    this.currentPhaseName.set('Final Synthesis');

    const newTask: ActivityTask = {
      id: phaseId || 'synthesis',
      nodeId: phaseId || 'synthesis',
      stage: this.phaseCounter as 1 | 2 | 3,
      type: 'milestone',
      description: `Synthesizing final answer from ${subQueryCount || 0} sub-queries`,
      progress: 0,
      status: 'running',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };

    this.activeTasks.update(tasks => [...tasks, newTask]);
    this.updateStageProgress();
  }

  private handleFinalSynthesisCompleted(event: any): void {
    console.log('Final synthesis completed:', event);
    const { phaseId, answerLength, subQueryCount } = event;

    const taskId = phaseId || 'synthesis';

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.id === taskId);
      if (index >= 0) {
        const completedTask = {
          ...tasks[index],
          description: `Synthesized final answer (${answerLength || 0} chars from ${subQueryCount || 0} sub-queries)`,
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

  private handlePlanCreated(event: any): void {
    console.log('Plan created:', event);
    const { totalPhases, phases, query, planId } = event;

    // End planning phase
    this.isPlanning.set(false);
    this.planningIteration.set(null);
    this.currentPhaseName.set('Planning complete');

    if (totalPhases) {
      this.totalPhases.set(totalPhases);
    }

    if (query) {
      this.planQuery.set(query);
    }

    // Store the full plan structure
    if (phases && Array.isArray(phases)) {
      const phasesWithOrder = phases.map((phase, index) => ({
        ...phase,
        order: phase.order ?? index
      }));
      this.plannedPhases.set(phasesWithOrder as PlannedPhase[]);
    }

    // Complete the planning task and move to completed
    this.activeTasks.update(tasks => {
      const planningIdx = tasks.findIndex(t => t.id === 'planning-llm');
      if (planningIdx >= 0) {
        const completedTask = {
          ...tasks[planningIdx],
          description: `✅ Plan created: ${totalPhases} phases`,
          status: 'completed' as TaskStatus,
          progress: 100,
        };
        this.completedTasks.update(completed => [...completed, completedTask]);
        return tasks.filter((_, i) => i !== planningIdx);
      }
      return tasks;
    });
  }

  private handlePhaseAdded(event: any): void {
    const { phaseId, phaseName, name } = event;
    console.log('Phase added:', event);

    const newTask: ActivityTask = {
      id: `planning-phase-${phaseId}`,
      nodeId: phaseId,
      stage: 1,
      type: 'milestone',
      description: `Planning: ${phaseName || name}`,
      progress: 100,
      status: 'completed',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };

    this.activeTasks.update(tasks => [...tasks, newTask]);
    // Immediately move to completed since it's just a planning notification
    setTimeout(() => {
      this.activeTasks.update(tasks => tasks.filter(t => t.id !== newTask.id));
      this.completedTasks.update(completed => [...completed, newTask]);
    }, 500);
  }

  private handleStepAdded(event: any): void {
    const { stepId, toolName } = event;
    console.log('Step added:', event);

    const newTask: ActivityTask = {
      id: `planning-step-${stepId}`,
      nodeId: stepId,
      stage: 1,
      type: 'tool',
      description: `Planned: ${toolName}`,
      progress: 100,
      status: 'completed',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };

    this.activeTasks.update(tasks => [...tasks, newTask]);
    // Immediately move to completed since it's just a planning notification
    setTimeout(() => {
      this.activeTasks.update(tasks => tasks.filter(t => t.id !== newTask.id));
      this.completedTasks.update(completed => [...completed, newTask]);
    }, 500);
  }

  private handlePhaseStarted(event: any): void {
    const { phaseId, phaseName, stepCount, subQueryCount, isDecomposed } = event;

    // Increment phase counter
    this.phaseCounter++;
    this.currentStage.set(this.phaseCounter);
    this.currentPhaseName.set(phaseName);

    // For decomposed queries, use subQueryCount; otherwise use stepCount
    // Provide default value of 0 to prevent undefined
    const itemCount = isDecomposed ? (subQueryCount || 0) : (stepCount || 0);
    const itemLabel = isDecomposed ? 'sub-queries' : 'steps';

    const newTask: ActivityTask = {
      id: phaseId,
      nodeId: phaseId,
      stage: this.phaseCounter as 1 | 2 | 3,
      type: 'milestone',
      description: `Phase: ${phaseName} (${itemCount} ${itemLabel})`,
      progress: 0,
      status: 'running',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };

    this.activeTasks.update(tasks => [...tasks, newTask]);
    this.updateStageProgress();

    // Update phase status in plannedPhases
    this.updatePlannedPhaseStatus(phaseId, 'running');
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

    // Update phase status in plannedPhases
    this.updatePlannedPhaseStatus(phaseId, 'completed');
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
    const { stepId, toolName, config } = event;

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
      // NEW: Capture input data
      toolName: toolName,
      input: config,
    };

    this.activeTasks.update(tasks => [...tasks, newTask]);

    // Update step status in plannedPhases
    this.updatePlannedStepStatus(stepId, 'running');
  }

  private handleStepCompleted(event: any): void {
    const { stepId, toolName, durationMs, input, output, tokensUsed, metadata } = event;

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.id === stepId);
      if (index >= 0) {
        const existingTask = tasks[index];
        const completedTask: ActivityTask = {
          ...existingTask,
          description: `Completed: ${toolName} (${durationMs}ms)`,
          status: 'completed' as TaskStatus,
          progress: 100,
          duration: durationMs,
          // NEW: Preserve input/output data
          toolName: toolName,
          input: input ?? existingTask.input,
          output: output,
          tokensUsed: tokensUsed,
          metadata: metadata,
        };
        this.completedTasks.update(completed => [...completed, completedTask]);
        return tasks.filter((_, i) => i !== index);
      }
      return tasks;
    });

    this.updateStageProgress();

    // Update step status in plannedPhases
    this.updatePlannedStepStatus(stepId, 'completed');
  }

  private handleStepFailed(event: any): void {
    const { stepId, toolName, error, input, durationMs } = event;

    this.activeTasks.update(tasks => {
      const index = tasks.findIndex(t => t.id === stepId);
      if (index >= 0) {
        const existingTask = tasks[index];
        const updated = [...tasks];
        updated[index] = {
          ...updated[index],
          description: `Failed: ${toolName}`,
          status: 'error' as TaskStatus,
          duration: durationMs,
          error: {
            message: error?.message || 'Step failed',
            timestamp: new Date(),
          },
          canRetry: true,
          // NEW: Preserve input for debugging
          toolName: toolName,
          input: input ?? existingTask.input,
        };
        return updated;
      }
      return tasks;
    });

    // Update step status in plannedPhases
    this.updatePlannedStepStatus(stepId, 'failed');
  }

  private async handleSessionCompleted(event: any): Promise<void> {
    console.log('Session completed:', event);
    this.isComplete.set(true);

    // Fetch the final result from the API
    if (this.currentLogId) {
      try {
        const result = await firstValueFrom(
          this.http.get<ResearchResult>(`${environment.apiUrl}/research/results/${this.currentLogId}`)
        );
        if (result) {
          this.researchResult.set(result);
        }
      } catch (error) {
        console.error('Failed to fetch research result:', error);
      }
    }

    // Disconnect SSE to prevent reconnection attempts after completion
    this.disconnect();
  }

  private handleSessionFailed(event: any): void {
    console.log('Session failed:', event);
    const { error } = event;
    this.connectionError.set(error || 'Research failed');
    // Disconnect SSE to prevent reconnection attempts after failure
    this.disconnect();
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

  private updatePlannedStepStatus(stepId: string, status: string): void {
    this.plannedPhases.update(phases => {
      return phases.map(phase => ({
        ...phase,
        steps: phase.steps.map(step =>
          step.id === stepId ? { ...step, status } : step
        )
      }));
    });
  }

  private updatePlannedPhaseStatus(phaseId: string, status: string): void {
    this.plannedPhases.update(phases => {
      return phases.map(phase =>
        phase.id === phaseId ? { ...phase, status } : phase
      );
    });
  }

  /**
   * Handle milestone events for granular progress feedback
   */
  private handleMilestoneEvent(event: any, eventType: 'started' | 'progress' | 'completed'): void {
    console.log(`Milestone ${eventType}:`, event);

    const milestone: MilestoneTask = {
      id: `${event.milestoneId}-${Date.now()}`,
      nodeId: event.nodeId || '',
      milestoneId: event.milestoneId || '',
      stage: event.stage || 1,
      template: event.template || '',
      templateData: event.templateData || {},
      description: event.description || event.title || 'Processing...',
      progress: event.progress || 0,
      status: this.mapMilestoneStatus(eventType, event.status),
      timestamp: new Date(event.timestamp || Date.now()),
    };

    if (eventType === 'started' || eventType === 'progress') {
      // Set as current milestone
      this.currentMilestone.set(milestone);
    } else if (eventType === 'completed') {
      // Move to history and clear current
      this.milestoneHistory.update(history => [...history, milestone]);

      // Clear current milestone after a brief display
      setTimeout(() => {
        const current = this.currentMilestone();
        if (current?.milestoneId === milestone.milestoneId) {
          this.currentMilestone.set(null);
        }
      }, 1000);
    }
  }

  /**
   * Map event type to task status
   */
  private mapMilestoneStatus(eventType: 'started' | 'progress' | 'completed', status?: string): TaskStatus {
    if (eventType === 'completed' || status === 'completed') {
      return 'completed';
    }
    if (status === 'error') {
      return 'error';
    }
    return 'running';
  }

  // Evaluation event handlers
  private handleEvaluationStarted(event: any): void {
    console.log('🔍 [EVALUATION] Evaluation started event received:', event);
    const { phase, query } = event;

    // Set the evaluation status to in_progress
    const evaluationResult: EvaluationResult = {
      phase: phase as 'plan' | 'retrieval' | 'answer',
      status: 'in_progress',
      timestamp: event.timestamp
    };

    // Update the appropriate evaluation signal
    console.log(`🔍 [EVALUATION] Setting ${phase} evaluation signal to in_progress`);
    switch (phase) {
      case 'plan':
        this.planEvaluation.set(evaluationResult);
        console.log('🔍 [EVALUATION] planEvaluation signal updated:', this.planEvaluation());
        break;
      case 'retrieval':
        this.retrievalEvaluation.set(evaluationResult);
        console.log('🔍 [EVALUATION] retrievalEvaluation signal updated:', this.retrievalEvaluation());
        break;
      case 'answer':
        this.answerEvaluation.set(evaluationResult);
        console.log('🔍 [EVALUATION] answerEvaluation signal updated:', this.answerEvaluation());
        break;
    }
  }

  private handleEvaluationCompleted(event: any): void {
    console.log('🔍 [EVALUATION] Evaluation completed event received:', event);
    const {
      phase,
      passed,
      scores,
      confidence,
      totalIterations,
      escalatedToLargeModel,
      evaluationSkipped,
      skipReason
    } = event;

    // Create evaluation result
    const evaluationResult: EvaluationResult = {
      phase: phase as 'plan' | 'retrieval' | 'answer',
      status: evaluationSkipped ? 'skipped' : (passed ? 'passed' : 'failed'),
      passed,
      scores,
      confidence,
      totalIterations,
      escalatedToLargeModel,
      evaluationSkipped,
      skipReason,
      timestamp: event.timestamp
    };

    // Update the appropriate evaluation signal
    console.log(`🔍 [EVALUATION] Setting ${phase} evaluation signal to completed with status: ${evaluationResult.status}`);
    switch (phase) {
      case 'plan':
        this.planEvaluation.set(evaluationResult);
        console.log('🔍 [EVALUATION] planEvaluation signal updated:', this.planEvaluation());
        break;
      case 'retrieval':
        this.retrievalEvaluation.set(evaluationResult);
        console.log('🔍 [EVALUATION] retrievalEvaluation signal updated:', this.retrievalEvaluation());
        break;
      case 'answer':
        this.answerEvaluation.set(evaluationResult);
        console.log('🔍 [EVALUATION] answerEvaluation signal updated:', this.answerEvaluation());
        break;
    }
  }

  private handleEvaluationFailed(event: any): void {
    console.log('🔍 [EVALUATION] Evaluation failed event received:', event);
    const { phase, error } = event;

    // Create failed evaluation result
    const evaluationResult: EvaluationResult = {
      phase: phase as 'plan' | 'retrieval' | 'answer',
      status: 'failed',
      error: error || 'Evaluation failed',
      timestamp: event.timestamp
    };

    // Update the appropriate evaluation signal
    console.log(`🔍 [EVALUATION] Setting ${phase} evaluation signal to failed`);
    switch (phase) {
      case 'plan':
        this.planEvaluation.set(evaluationResult);
        console.log('🔍 [EVALUATION] planEvaluation signal updated:', this.planEvaluation());
        break;
      case 'retrieval':
        this.retrievalEvaluation.set(evaluationResult);
        console.log('🔍 [EVALUATION] retrievalEvaluation signal updated:', this.retrievalEvaluation());
        break;
      case 'answer':
        this.answerEvaluation.set(evaluationResult);
        console.log('🔍 [EVALUATION] answerEvaluation signal updated:', this.answerEvaluation());
        break;
    }
  }

  /**
   * Handle reasoning events for transparency into agent thinking
   */
  private handleReasoningEvent(event: any, type: 'thought' | 'action_planned' | 'observation' | 'conclusion'): void {
    console.log(`🧠 [REASONING] ${type} event received:`, event);

    // Extract data from SSE event structure (data is nested in event.data)
    const data = event.data || event;

    const reasoningEvent = {
      type,
      id: data.thoughtId || data.actionId || data.observationId || data.conclusionId || event.id || `${type}-${Date.now()}`,
      timestamp: new Date(event.timestamp || Date.now()),
      content: data.content,
      action: data.action,
      tool: data.tool,
      parameters: data.parameters,
      reasoning: data.reasoning,
      actionId: data.actionId,
      result: data.result,
      analysis: data.analysis,
      implications: data.implications,
      conclusion: data.conclusion,
      supportingThoughts: data.supportingThoughts,
      confidence: data.confidence,
      nextSteps: data.nextSteps,
      context: data.context
    };

    this.reasoningEvents.update(events => [...events, reasoningEvent]);
  }

  /**
   * Handle confidence scoring events for answer confidence
   */
  private handleConfidenceScoringStarted(event: any): void {
    console.log('Confidence scoring started:', event);
    // Create an activity task to show progress
    const task: ActivityTask = {
      id: 'confidence-scoring',
      nodeId: 'confidence',
      stage: (this.currentStage() || 1) as 1 | 2 | 3,
      type: 'milestone',
      description: '📊 Scoring answer confidence...',
      progress: 0,
      status: 'running',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };
    this.activeTasks.update(tasks => [...tasks, task]);
  }

  private handleConfidenceScoringCompleted(event: any): void {
    console.log('Confidence scoring completed:', event);
    const { confidence } = event;
    this.confidenceResult.set(confidence);

    // Move task to completed
    this.activeTasks.update(tasks => tasks.filter(t => t.id !== 'confidence-scoring'));
    const completedTask: ActivityTask = {
      id: 'confidence-scoring',
      nodeId: 'confidence',
      stage: (this.currentStage() || 1) as 1 | 2 | 3,
      type: 'milestone',
      description: `📊 Confidence: ${((confidence?.overallConfidence || 0) * 100).toFixed(0)}% (${confidence?.level || 'unknown'})`,
      progress: 100,
      status: 'completed',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };
    this.completedTasks.update(tasks => [...tasks, completedTask]);
  }

  private handleConfidenceScoringFailed(event: any): void {
    console.log('Confidence scoring failed:', event);
    // Move task to failed
    this.activeTasks.update(tasks => tasks.filter(t => t.id !== 'confidence-scoring'));
    const failedTask: ActivityTask = {
      id: 'confidence-scoring',
      nodeId: 'confidence',
      stage: (this.currentStage() || 1) as 1 | 2 | 3,
      type: 'milestone',
      description: `📊 Confidence scoring failed: ${event.error || 'Unknown error'}`,
      progress: 0,
      status: 'error',
      timestamp: new Date(event.timestamp),
      retryCount: 0,
      canRetry: false,
    };
    this.completedTasks.update(tasks => [...tasks, failedTask]);
  }
}
