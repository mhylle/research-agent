import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LogSession, LogDetail, LogEntry, TimelineNode, GraphData } from '../../models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LogsService {
  // Signals
  sessions = signal<LogSession[]>([]);
  selectedLogId = signal<string | null>(null);
  logDetail = signal<LogDetail | null>(null);
  graphData = signal<GraphData | null>(null);
  isLoadingSessions = signal<boolean>(false);
  isLoadingDetails = signal<boolean>(false);
  isLoadingGraph = signal<boolean>(false);
  searchTerm = signal<string>('');
  statusFilter = signal<'all' | 'completed' | 'error'>('all');
  error = signal<string | null>(null);

  // Computed
  filteredSessions = computed(() => {
    let filtered = this.sessions();

    // Search filter (client-side for responsiveness)
    const search = this.searchTerm().toLowerCase();
    if (search) {
      filtered = filtered.filter(s =>
        s.query.toLowerCase().includes(search) ||
        s.logId.includes(search)
      );
    }

    // Status filter
    const status = this.statusFilter();
    if (status !== 'all') {
      filtered = filtered.filter(s => s.status === status);
    }

    return filtered;
  });

  selectedSession = computed(() =>
    this.sessions().find(s => s.logId === this.selectedLogId())
  );

  timelineNodes = computed(() => {
    const detail = this.logDetail();
    if (!detail) return [];
    return this.buildTimelineFromEntries(detail.entries);
  });

  constructor(private http: HttpClient) {}

  async loadSessions(): Promise<void> {
    this.isLoadingSessions.set(true);
    this.error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.get<{ sessions: LogSession[], total: number }>(
          `${environment.apiUrl}/logs/sessions`,
          { params: new HttpParams().set('limit', '200') }
        )
      );

      this.sessions.set(response.sessions);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to load sessions');
    } finally {
      this.isLoadingSessions.set(false);
    }
  }

  async selectSession(logId: string): Promise<void> {
    this.selectedLogId.set(logId);
    this.isLoadingDetails.set(true);
    this.error.set(null);

    try {
      const detail = await firstValueFrom(
        this.http.get<LogDetail>(`${environment.apiUrl}/logs/sessions/${logId}`)
      );

      this.logDetail.set(detail);

      // Also load graph data
      await this.loadGraphData(logId);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to load log details');
    } finally {
      this.isLoadingDetails.set(false);
    }
  }

  async loadGraphData(logId: string): Promise<void> {
    this.isLoadingGraph.set(true);

    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/logs/graph/${logId}`)
      );

      // Convert date strings to Date objects
      const graphData: GraphData = {
        nodes: response.nodes.map((node: any) => ({
          ...node,
          startTime: new Date(node.startTime),
          endTime: node.endTime ? new Date(node.endTime) : undefined,
        })),
        edges: response.edges,
        metadata: {
          ...response.metadata,
          startTime: response.metadata.startTime ? new Date(response.metadata.startTime) : undefined,
          endTime: response.metadata.endTime ? new Date(response.metadata.endTime) : undefined,
        },
      };

      this.graphData.set(graphData);
    } catch (err: any) {
      console.error('Failed to load graph data:', err);
      // Don't set error signal, graph is optional
    } finally {
      this.isLoadingGraph.set(false);
    }
  }

  private buildTimelineFromEntries(entries: LogEntry[]): TimelineNode[] {
    if (!entries || entries.length === 0) return [];

    const stages: TimelineNode[] = [];
    const phaseMap = new Map<string, any>();
    const milestoneMap = new Map<string, any>();
    let planningPhase: any = null;
    const recoveryNodes: any[] = [];

    // First pass: collect planning phase
    entries.forEach(entry => {
      if (entry.eventType === 'planning_started') {
        planningPhase = {
          type: 'planning',
          id: 'planning-' + entry.id,
          name: 'Planning Phase',
          icon: '🧠',
          color: '#8b5cf6',
          timestamp: entry.timestamp,
          input: entry.data,
          output: null,
          status: 'running',
          duration: 0,
          isExpanded: false
        };
      }

      if (entry.eventType === 'plan_created' && planningPhase) {
        planningPhase.output = entry.data;
        planningPhase.status = 'completed';
        const startTime = new Date(planningPhase.timestamp).getTime();
        const endTime = new Date(entry.timestamp).getTime();
        planningPhase.duration = endTime - startTime;
      }
    });

    // Second pass: collect phase information
    entries.forEach(entry => {
      if (entry.eventType === 'phase_added' && entry.phaseId) {
        phaseMap.set(entry.phaseId, {
          phaseId: entry.phaseId,
          name: entry.data?.name || 'Phase',
          addedAt: entry.timestamp,
          startedAt: null,
          completedAt: null,
          failedAt: null,
          input: entry.data,  // Store phase input data
          output: null,
          steps: [],
          metadata: {
            isAutoAdded: entry.data?.isAutoAdded || false
          }
        });
      }
      if (entry.eventType === 'phase_started' && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) phase.startedAt = entry.timestamp;
      }
      if (entry.eventType === 'phase_completed' && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) {
          phase.completedAt = entry.timestamp;
          phase.output = entry.data;  // Store phase output/completion data
        }
      }
      if (entry.eventType === 'phase_failed' && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) {
          phase.failedAt = entry.timestamp;
          phase.output = entry.data;
          phase.error = {
            message: entry.data?.error?.message || 'Phase failed',
            code: entry.data?.error?.code,
            details: entry.data?.error
          };
        }
      }
    });

    // Third pass: collect milestones
    entries.forEach(entry => {
      if (entry.eventType === 'milestone_started' && entry.phaseId) {
        const milestoneId = entry.data?.milestoneId || `milestone-${entry.id}`;
        milestoneMap.set(milestoneId, {
          type: 'milestone',
          id: milestoneId,
          phaseId: entry.phaseId,
          name: entry.data?.description || entry.data?.template || 'Milestone',
          icon: '🎯',
          color: '#f59e0b',
          timestamp: entry.timestamp,
          status: 'running',
          input: {
            template: entry.data?.template,
            data: entry.data?.templateData
          },
          output: null,
          duration: 0,
          isExpanded: false,
          metadata: {
            stage: entry.data?.stage,
            progress: entry.data?.progress
          }
        });
      }

      if (entry.eventType === 'milestone_completed') {
        const milestoneId = entry.data?.milestoneId;
        const milestone = milestoneMap.get(milestoneId);
        if (milestone) {
          milestone.status = 'completed';
          milestone.output = { progress: 100 };
          const startTime = new Date(milestone.timestamp).getTime();
          const endTime = new Date(entry.timestamp).getTime();
          milestone.duration = endTime - startTime;
        }
      }
    });

    // Fourth pass: collect auto-recovery events
    entries.forEach(entry => {
      if (entry.eventType === 'auto_recovery') {
        const recoveryNode: TimelineNode = {
          type: 'recovery',
          id: 'recovery-' + entry.id,
          name: 'Auto-Recovery',
          icon: '🔧',
          color: '#ef4444',
          timestamp: entry.timestamp,
          duration: 0,
          input: { reason: entry.data?.reason },
          output: entry.data,
          status: 'completed',
          metadata: {
            emptyPhaseCount: entry.data?.emptyPhaseCount,
            failureCount: entry.data?.failureCount,
            recoveryReason: entry.data?.reason
          },
          isExpanded: false
        };
        recoveryNodes.push(recoveryNode);
      }
    });

    // Fifth pass: collect steps for each phase
    entries.forEach(entry => {
      if (entry.eventType === 'step_started' && entry.stepId && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) {
          phase.steps.push({
            stepId: entry.stepId,
            toolName: entry.data?.toolName || 'Tool',
            startedAt: entry.timestamp,
            completedAt: null,
            failedAt: null,
            skippedAt: null,
            // For step_started, the input is in the 'config' field
            input: entry.data?.config || entry.data?.input || null,
            output: null,
            duration: 0,
            status: 'running'
          });
        } else {
          console.warn(`Step ${entry.stepId} references unknown phase ${entry.phaseId}`);
        }
      }
      if (entry.eventType === 'step_completed' && entry.stepId && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) {
          const step = phase.steps.find((s: any) => s.stepId === entry.stepId);
          if (step) {
            step.completedAt = entry.timestamp;
            step.status = 'completed';
            // For step_completed, update the input from the 'input' field and output from 'output' field
            step.input = entry.data?.input || step.input;  // Update input with actual input from completion event
            step.output = entry.data?.output || null;
            step.duration = entry.data?.durationMs || 0;
          }
        }
      }
      if (entry.eventType === 'step_failed' && entry.stepId && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) {
          const step = phase.steps.find((s: any) => s.stepId === entry.stepId);
          if (step) {
            step.failedAt = entry.timestamp;
            step.status = 'error';
            step.input = entry.data?.input || step.input;
            step.output = entry.data?.output || null;
            step.duration = entry.data?.durationMs || 0;
            step.error = {
              message: entry.data?.error?.message || 'Step failed',
              code: entry.data?.error?.code,
              details: entry.data?.error
            };
          }
        }
      }
      if (entry.eventType === 'step_skipped' && entry.stepId && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) {
          const step = phase.steps.find((s: any) => s.stepId === entry.stepId);
          if (step) {
            step.skippedAt = entry.timestamp;
            step.status = 'skipped';
            step.input = entry.data?.input || step.input;
            step.output = entry.data?.output || null;
          }
        }
      }
    });

    // Build timeline nodes from phases
    let phaseIndex = 0;
    phaseMap.forEach((phase) => {
      phaseIndex++;

      // Build tool nodes from steps
      const toolNodes: TimelineNode[] = phase.steps.map((step: any, idx: number) => ({
        type: 'tool' as const,
        id: `phase${phaseIndex}-tool${idx}`,
        name: this.getToolDisplayName(step.toolName),
        icon: this.getToolIcon(step.toolName),
        color: '#f59e0b',
        duration: step.duration || 0,
        timestamp: step.startedAt,
        input: step.input,
        output: this.parseToolOutput(step.output),
        status: step.status,
        error: step.error,
        isExpanded: false
      }));

      console.log(`Phase ${phaseIndex} (${phase.name}): ${phase.steps.length} steps -> ${toolNodes.length} tool nodes`);

      // Determine phase status
      let phaseStatus: 'pending' | 'running' | 'completed' | 'error' | 'abandoned' = 'pending';
      if (phase.failedAt) {
        phaseStatus = 'error';
      } else if (phase.completedAt) {
        phaseStatus = 'completed';
      } else if (phase.startedAt) {
        phaseStatus = 'running';
      } else if (phase.addedAt && !phase.startedAt) {
        phaseStatus = 'abandoned';
        phase.metadata.isAbandoned = true;
      }

      // Calculate phase duration
      const startTime = phase.startedAt || phase.addedAt;
      const endTime = phase.completedAt || phase.failedAt;
      const duration = startTime && endTime
        ? new Date(endTime).getTime() - new Date(startTime).getTime()
        : 0;

      // Get milestones for this phase
      const phaseMilestones: TimelineNode[] = Array.from(milestoneMap.values())
        .filter((m: any) => m.phaseId === phase.phaseId);

      // Build stage node
      stages.push({
        type: 'stage' as const,
        id: `phase${phaseIndex}`,
        name: this.getPhaseName(phase.name, phaseIndex),
        icon: this.getStageIcon(phaseIndex),
        color: this.getStageColor(phaseIndex),
        duration,
        timestamp: startTime,
        input: this.formatPhaseInput(phase.input),
        output: this.formatPhaseOutput(phase.output, phase.steps),
        children: toolNodes,
        status: phaseStatus,
        error: phase.error,
        metadata: phase.metadata,
        milestones: phaseMilestones,
        isExpanded: false
      });
    });

    // Add planning phase at the beginning if it exists
    if (planningPhase) {
      stages.unshift(planningPhase);
    }

    // Insert recovery nodes at appropriate positions
    // For simplicity, add them to the end for now
    // In a more sophisticated implementation, you could insert them before the phase they recovered
    recoveryNodes.forEach(node => {
      stages.push(node);
    });

    return stages;
  }

  private getPhaseName(name: string, index: number): string {
    // Use the phase name from the backend, or fallback to generic names
    if (name && name !== 'Phase') {
      return name;
    }
    const defaultNames: Record<number, string> = {
      1: 'Query Analysis & Search',
      2: 'Content Fetch & Selection',
      3: 'Synthesis & Answer Generation'
    };
    return defaultNames[index] || `Phase ${index}`;
  }

  private getStageName(stage: number): string {
    const names: Record<number, string> = {
      1: 'Query Analysis & Search',
      2: 'Content Fetch & Selection',
      3: 'Synthesis & Answer Generation'
    };
    return names[stage] || `Stage ${stage}`;
  }

  private getStageIcon(stage: number): string {
    const icons: Record<number, string> = { 1: '🔍', 2: '📄', 3: '✨' };
    return icons[stage] || '📋';
  }

  private getStageColor(stage: number): string {
    const colors: Record<number, string> = {
      1: '#3b82f6',  // Blue
      2: '#8b5cf6',  // Purple
      3: '#10b981'   // Green
    };
    return colors[stage] || '#6b7280';
  }

  private getToolDisplayName(toolName: string): string {
    if (!toolName) return 'Tool';

    const names: Record<string, string> = {
      'tavily_search': 'Tavily Search',
      'TavilySearch': 'Tavily Search',
      'web_fetch': 'Web Fetch',
      'WebFetch': 'Web Fetch',
      'pdf_extract': 'PDF Extract',
      'PdfExtract': 'PDF Extract',
      'llm': 'LLM',
      'LLM': 'LLM'
    };

    // Try exact match first
    if (names[toolName]) {
      return names[toolName];
    }

    // Try case-insensitive match
    const lowerToolName = toolName.toLowerCase();
    const matchedKey = Object.keys(names).find(key => key.toLowerCase() === lowerToolName);
    if (matchedKey) {
      return names[matchedKey];
    }

    // Return the original name with proper casing
    return toolName.charAt(0).toUpperCase() + toolName.slice(1);
  }

  private getToolIcon(toolName: string): string {
    if (!toolName) return '🔧';

    const icons: Record<string, string> = {
      'tavily_search': '🔎',
      'tavilysearch': '🔎',
      'web_fetch': '🌐',
      'webfetch': '🌐',
      'pdf_extract': '📑',
      'pdfextract': '📑',
      'llm': '🤖'
    };

    const lowerToolName = toolName.toLowerCase();
    return icons[lowerToolName] || '🔧';
  }

  private parseToolOutput(output: any): any {
    // Tool output might be stringified JSON, parse if needed
    if (typeof output === 'string') {
      try {
        return JSON.parse(output);
      } catch {
        return output;
      }
    }
    return output;
  }

  private formatPhaseInput(input: any): any {
    if (!input) return null;

    // Phase input contains name, description, replanCheckpoint
    // Return a clean version for display
    return {
      name: input.name,
      description: input.description,
      replanCheckpoint: input.replanCheckpoint
    };
  }

  private formatPhaseOutput(output: any, steps: any[]): any {
    if (!output && (!steps || steps.length === 0)) return null;

    // If we have phase completion data, use that
    if (output) {
      // Phase output may contain completion metadata
      return {
        phaseName: output.phaseName,
        stepsCompleted: output.stepsCompleted,
        reason: output.reason,
        // Include any other relevant data from the phase completion
        ...output
      };
    }

    // Fallback: aggregate step outputs
    // Get the last completed step's output as the phase result
    const completedSteps = steps.filter((s: any) => s.output);
    if (completedSteps.length > 0) {
      const lastStep = completedSteps[completedSteps.length - 1];
      return {
        source: 'last_step',
        stepCount: steps.length,
        lastStepOutput: this.parseToolOutput(lastStep.output)
      };
    }

    return null;
  }

  clearError(): void {
    this.error.set(null);
  }
}
