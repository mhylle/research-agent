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

    // First pass: collect phase information
    entries.forEach(entry => {
      if (entry.eventType === 'phase_added' && entry.phaseId) {
        phaseMap.set(entry.phaseId, {
          phaseId: entry.phaseId,
          name: entry.data?.name || 'Phase',
          addedAt: entry.timestamp,
          startedAt: null,
          completedAt: null,
          steps: []
        });
      }
      if (entry.eventType === 'phase_started' && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) phase.startedAt = entry.timestamp;
      }
      if ((entry.eventType === 'phase_completed' || entry.eventType === 'phase_failed') && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) phase.completedAt = entry.timestamp;
      }
    });

    // Second pass: collect steps for each phase
    entries.forEach(entry => {
      if (entry.eventType === 'step_started' && entry.stepId && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) {
          phase.steps.push({
            stepId: entry.stepId,
            toolName: entry.data?.toolName || 'Tool',
            startedAt: entry.timestamp,
            completedAt: null,
            input: entry.data,
            output: null,
            duration: 0
          });
        }
      }
      if ((entry.eventType === 'step_completed' || entry.eventType === 'step_failed') && entry.stepId && entry.phaseId) {
        const phase = phaseMap.get(entry.phaseId);
        if (phase) {
          const step = phase.steps.find((s: any) => s.stepId === entry.stepId);
          if (step) {
            step.completedAt = entry.timestamp;
            step.output = entry.data;
            step.duration = entry.data?.durationMs || 0;
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
        type: 'tool',
        id: `phase${phaseIndex}-tool${idx}`,
        name: this.getToolDisplayName(step.toolName),
        icon: this.getToolIcon(step.toolName),
        color: '#f59e0b',
        duration: step.duration || 0,
        timestamp: step.startedAt,
        input: step.input,
        output: this.parseToolOutput(step.output),
        isExpanded: false
      }));

      // Calculate phase duration
      const startTime = phase.startedAt || phase.addedAt;
      const endTime = phase.completedAt;
      const duration = startTime && endTime
        ? new Date(endTime).getTime() - new Date(startTime).getTime()
        : 0;

      // Build stage node
      stages.push({
        type: 'stage',
        id: `phase${phaseIndex}`,
        name: this.getPhaseName(phase.name, phaseIndex),
        icon: this.getStageIcon(phaseIndex),
        color: this.getStageColor(phaseIndex),
        duration,
        timestamp: startTime,
        input: null,
        output: null,
        children: toolNodes,
        isExpanded: false
      });
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

  clearError(): void {
    this.error.set(null);
  }
}
