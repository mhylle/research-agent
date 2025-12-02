import { Injectable } from '@angular/core';
import { GraphNode, GraphEdge, GraphData, NodeType, NodeStatus, NodeMetrics } from '../../models';
import { LogDetail, LogEntry } from '../../models/log-detail.model';

interface PhaseInfo {
  id: string;
  name: string;
  startTime?: Date;
  endTime?: Date;
  status: NodeStatus;
  stepIds: string[];
}

interface StepInfo {
  id: string;
  phaseId: string;
  toolName: string;
  startTime?: Date;
  endTime?: Date;
  status: NodeStatus;
  duration?: number;
  input?: any;
  output?: any;
  tokensUsed?: number;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GraphBuilderService {

  private readonly toolIcons: Record<string, string> = {
    'tavily_search': '🔎',
    'tavilysearch': '🔎',
    'web_fetch': '🌐',
    'webfetch': '🌐',
    'duckduckgo_search': '🦆',
    'brave_search': '🦁',
    'knowledge_search': '📚',
    'synthesize': '✨',
    'llm': '🤖',
    'planning': '🧠',
    'evaluation': '📊',
    'default': '🔧'
  };

  private readonly phaseIcons: Record<string, string> = {
    'planning': '🎯',
    'retrieval': '🔍',
    'synthesis': '✨',
    'evaluation': '📊',
    'default': '📦'
  };

  /**
   * Build a GraphData structure from log entries
   */
  buildGraphFromLogs(logDetail: LogDetail): GraphData {
    const phases = new Map<string, PhaseInfo>();
    const steps = new Map<string, StepInfo>();
    const sessionStartTime = new Date(logDetail.timestamp);

    // Process log entries to extract phases and steps
    for (const entry of logDetail.entries) {
      this.processLogEntry(entry, phases, steps);
    }

    // Build nodes
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Create root session node
    const sessionNode: GraphNode = {
      id: 'session-root',
      type: 'stage',
      name: 'Research Session',
      icon: '🔬',
      color: '#6366f1',
      size: 'large',
      startTime: sessionStartTime,
      endTime: logDetail.status === 'completed' ? new Date(sessionStartTime.getTime() + logDetail.totalDuration) : undefined,
      duration: logDetail.totalDuration,
      status: this.mapLogStatus(logDetail.status),
      childrenIds: Array.from(phases.keys()),
      dependsOn: []
    };
    nodes.push(sessionNode);

    // Create phase nodes
    for (const [phaseId, phase] of phases) {
      const phaseNode: GraphNode = {
        id: phaseId,
        type: 'stage',
        name: phase.name,
        icon: this.getPhaseIcon(phase.name),
        color: this.getPhaseColor(phase.name),
        size: 'medium',
        startTime: phase.startTime ?? sessionStartTime,
        endTime: phase.endTime,
        duration: phase.endTime && phase.startTime
          ? phase.endTime.getTime() - phase.startTime.getTime()
          : undefined,
        status: phase.status,
        parentId: 'session-root',
        childrenIds: phase.stepIds,
        dependsOn: []
      };
      nodes.push(phaseNode);

      // Edge from session to phase
      edges.push({
        id: `edge-session-${phaseId}`,
        source: 'session-root',
        target: phaseId,
        type: 'parent-child',
        animated: phase.status === 'running'
      });
    }

    // Create step nodes
    for (const [stepId, step] of steps) {
      const stepNode: GraphNode = {
        id: stepId,
        type: this.getStepNodeType(step.toolName),
        name: this.formatToolName(step.toolName),
        icon: this.getToolIcon(step.toolName),
        color: this.getToolColor(step.toolName),
        size: 'small',
        startTime: step.startTime ?? sessionStartTime,
        endTime: step.endTime,
        duration: step.duration,
        status: step.status,
        parentId: step.phaseId,
        childrenIds: [],
        dependsOn: [],
        input: step.input,
        output: step.output,
        error: step.error,
        metrics: {
          tokensUsed: step.tokensUsed,
          latency: step.duration
        }
      };
      nodes.push(stepNode);

      // Edge from phase to step
      edges.push({
        id: `edge-${step.phaseId}-${stepId}`,
        source: step.phaseId,
        target: stepId,
        type: 'parent-child',
        animated: step.status === 'running'
      });
    }

    // Add data-flow edges between sequential steps within same phase
    this.addDataFlowEdges(phases, steps, edges);

    return {
      nodes,
      edges,
      metadata: {
        startTime: sessionStartTime,
        endTime: logDetail.status === 'completed'
          ? new Date(sessionStartTime.getTime() + logDetail.totalDuration)
          : undefined,
        totalDuration: logDetail.totalDuration
      }
    };
  }

  private processLogEntry(
    entry: LogEntry,
    phases: Map<string, PhaseInfo>,
    steps: Map<string, StepInfo>
  ): void {
    const timestamp = new Date(entry.timestamp);
    const data = entry.data || {};

    switch (entry.eventType) {
      case 'planning_started':
        phases.set('phase-planning', {
          id: 'phase-planning',
          name: 'Planning',
          startTime: timestamp,
          status: 'running',
          stepIds: []
        });
        break;

      case 'plan_created':
        const planningPhase = phases.get('phase-planning');
        if (planningPhase) {
          planningPhase.endTime = timestamp;
          planningPhase.status = 'completed';
        }
        // Create phases from plan
        if (data.phases && Array.isArray(data.phases)) {
          for (const phase of data.phases) {
            phases.set(phase.id, {
              id: phase.id,
              name: phase.name,
              status: 'pending',
              stepIds: phase.steps?.map((s: any) => s.id) || []
            });
          }
        }
        break;

      case 'phase_started':
        const phaseId = entry.phaseId || data.phaseId;
        if (phaseId) {
          const phase = phases.get(phaseId);
          if (phase) {
            phase.startTime = timestamp;
            phase.status = 'running';
          } else {
            phases.set(phaseId, {
              id: phaseId,
              name: data.phaseName || data.name || phaseId,
              startTime: timestamp,
              status: 'running',
              stepIds: []
            });
          }
        }
        break;

      case 'phase_completed':
        const completedPhaseId = entry.phaseId || data.phaseId;
        if (completedPhaseId) {
          const phase = phases.get(completedPhaseId);
          if (phase) {
            phase.endTime = timestamp;
            phase.status = 'completed';
          }
        }
        break;

      case 'phase_failed':
        const failedPhaseId = entry.phaseId || data.phaseId;
        if (failedPhaseId) {
          const phase = phases.get(failedPhaseId);
          if (phase) {
            phase.endTime = timestamp;
            phase.status = 'error';
          }
        }
        break;

      case 'step_started':
        const stepId = entry.stepId || data.stepId;
        const stepPhaseId = entry.phaseId || data.phaseId || this.findCurrentPhase(phases);
        if (stepId) {
          steps.set(stepId, {
            id: stepId,
            phaseId: stepPhaseId,
            toolName: data.toolName || 'unknown',
            startTime: timestamp,
            status: 'running',
            input: data.config || data.input
          });
          // Add step to phase
          const phase = phases.get(stepPhaseId);
          if (phase && !phase.stepIds.includes(stepId)) {
            phase.stepIds.push(stepId);
          }
        }
        break;

      case 'step_completed':
        const completedStepId = entry.stepId || data.stepId;
        if (completedStepId) {
          const step = steps.get(completedStepId);
          if (step) {
            step.endTime = timestamp;
            step.status = 'completed';
            step.duration = data.durationMs;
            step.output = data.output;
            step.tokensUsed = data.tokensUsed?.total;
          }
        }
        break;

      case 'step_failed':
        const failedStepId = entry.stepId || data.stepId;
        if (failedStepId) {
          const step = steps.get(failedStepId);
          if (step) {
            step.endTime = timestamp;
            step.status = 'error';
            step.duration = data.durationMs;
            step.error = data.error?.message || data.error;
          }
        }
        break;

      case 'evaluation_started':
        const evalPhaseId = `eval-${data.phase}`;
        phases.set(evalPhaseId, {
          id: evalPhaseId,
          name: `${data.phase} Evaluation`,
          startTime: timestamp,
          status: 'running',
          stepIds: []
        });
        break;

      case 'evaluation_completed':
        const completedEvalId = `eval-${data.phase}`;
        const evalPhase = phases.get(completedEvalId);
        if (evalPhase) {
          evalPhase.endTime = timestamp;
          evalPhase.status = data.passed ? 'completed' : 'error';
        }
        break;
    }
  }

  private findCurrentPhase(phases: Map<string, PhaseInfo>): string {
    for (const [id, phase] of phases) {
      if (phase.status === 'running') {
        return id;
      }
    }
    return 'unknown-phase';
  }

  private addDataFlowEdges(
    phases: Map<string, PhaseInfo>,
    steps: Map<string, StepInfo>,
    edges: GraphEdge[]
  ): void {
    // For each phase, add sequential data-flow edges between steps
    for (const [phaseId, phase] of phases) {
      const phaseSteps = phase.stepIds
        .map(id => steps.get(id))
        .filter(s => s !== undefined)
        .sort((a, b) => (a!.startTime?.getTime() ?? 0) - (b!.startTime?.getTime() ?? 0));

      for (let i = 0; i < phaseSteps.length - 1; i++) {
        const source = phaseSteps[i]!;
        const target = phaseSteps[i + 1]!;

        edges.push({
          id: `flow-${source.id}-${target.id}`,
          source: source.id,
          target: target.id,
          type: 'data-flow',
          animated: target.status === 'running'
        });
      }
    }

    // Add edges between consecutive phases
    const phaseList = Array.from(phases.values())
      .filter(p => p.startTime)
      .sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0));

    for (let i = 0; i < phaseList.length - 1; i++) {
      edges.push({
        id: `phase-flow-${phaseList[i].id}-${phaseList[i + 1].id}`,
        source: phaseList[i].id,
        target: phaseList[i + 1].id,
        type: 'data-flow',
        animated: phaseList[i + 1].status === 'running'
      });
    }
  }

  private mapLogStatus(status: 'completed' | 'error' | 'incomplete'): NodeStatus {
    switch (status) {
      case 'completed': return 'completed';
      case 'error': return 'error';
      case 'incomplete': return 'running';
      default: return 'pending';
    }
  }

  private getStepNodeType(toolName: string): NodeType {
    const lowerName = toolName.toLowerCase();
    if (lowerName.includes('llm') || lowerName.includes('synthesize')) {
      return 'llm';
    }
    return 'tool';
  }

  private getToolIcon(toolName: string): string {
    const lowerName = toolName.toLowerCase();
    return this.toolIcons[lowerName] || this.toolIcons['default'];
  }

  private getPhaseIcon(phaseName: string): string {
    const lowerName = phaseName.toLowerCase();
    for (const [key, icon] of Object.entries(this.phaseIcons)) {
      if (lowerName.includes(key)) {
        return icon;
      }
    }
    return this.phaseIcons['default'];
  }

  private getToolColor(toolName: string): string {
    const colors: Record<string, string> = {
      'tavily_search': '#3b82f6',
      'tavilysearch': '#3b82f6',
      'web_fetch': '#8b5cf6',
      'webfetch': '#8b5cf6',
      'duckduckgo_search': '#f59e0b',
      'brave_search': '#ef4444',
      'knowledge_search': '#10b981',
      'synthesize': '#6366f1',
      'llm': '#8b5cf6'
    };
    return colors[toolName.toLowerCase()] || '#64748b';
  }

  private getPhaseColor(phaseName: string): string {
    const colors: Record<string, string> = {
      'planning': '#6366f1',
      'retrieval': '#3b82f6',
      'synthesis': '#8b5cf6',
      'evaluation': '#10b981'
    };
    const lowerName = phaseName.toLowerCase();
    for (const [key, color] of Object.entries(colors)) {
      if (lowerName.includes(key)) {
        return color;
      }
    }
    return '#64748b';
  }

  private formatToolName(toolName: string): string {
    const names: Record<string, string> = {
      'tavily_search': 'Tavily Search',
      'tavilysearch': 'Tavily Search',
      'web_fetch': 'Web Fetch',
      'webfetch': 'Web Fetch',
      'duckduckgo_search': 'DuckDuckGo',
      'brave_search': 'Brave Search',
      'knowledge_search': 'Knowledge Search',
      'synthesize': 'Synthesize',
      'llm': 'LLM'
    };
    return names[toolName.toLowerCase()] ||
      toolName.charAt(0).toUpperCase() + toolName.slice(1).replace(/_/g, ' ');
  }
}
