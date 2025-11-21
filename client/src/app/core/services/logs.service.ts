import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LogSession, LogDetail, LogEntry, TimelineNode } from '../../models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LogsService {
  // Signals
  sessions = signal<LogSession[]>([]);
  selectedLogId = signal<string | null>(null);
  logDetail = signal<LogDetail | null>(null);
  isLoadingSessions = signal<boolean>(false);
  isLoadingDetails = signal<boolean>(false);
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
    } catch (err: any) {
      this.error.set(err.message || 'Failed to load log details');
    } finally {
      this.isLoadingDetails.set(false);
    }
  }

  private buildTimelineFromEntries(entries: LogEntry[]): TimelineNode[] {
    if (!entries || entries.length === 0) return [];

    const stages: TimelineNode[] = [];

    // Process each stage (1, 2, 3)
    for (let stageNum = 1; stageNum <= 3; stageNum++) {
      const stageInput = entries.find(e =>
        e.stage === stageNum && e.operation === 'stage_input'
      );
      const stageOutput = entries.find(e =>
        e.stage === stageNum && e.operation === 'stage_output'
      );

      if (!stageInput) continue;

      // Find tool calls within this stage
      const toolCalls = entries.filter(e =>
        e.component !== 'pipeline' &&
        e.operation === 'execute' &&
        e.timestamp >= stageInput.timestamp &&
        (!stageOutput || e.timestamp <= stageOutput.timestamp)
      );

      // Build tool nodes
      const toolNodes: TimelineNode[] = toolCalls.map((tool, idx) => ({
        type: 'tool',
        id: `stage${stageNum}-tool${idx}`,
        name: this.getToolDisplayName(tool.component),
        icon: this.getToolIcon(tool.component),
        color: '#f59e0b',
        duration: tool.executionTime || 0,
        timestamp: tool.timestamp,
        input: tool.input,
        output: this.parseToolOutput(tool.output),
        isExpanded: false
      }));

      // Calculate duration
      const duration = stageOutput?.executionTime ||
        (stageOutput && stageInput ?
          new Date(stageOutput.timestamp).getTime() - new Date(stageInput.timestamp).getTime() :
          0);

      // Build stage node
      stages.push({
        type: 'stage',
        id: `stage${stageNum}`,
        name: this.getStageName(stageNum),
        icon: this.getStageIcon(stageNum),
        color: this.getStageColor(stageNum),
        duration,
        timestamp: stageInput.timestamp,
        input: stageInput.input,
        output: stageOutput?.output,
        children: toolNodes,
        isExpanded: false
      });
    }

    return stages;
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

  private getToolDisplayName(component: string): string {
    const names: Record<string, string> = {
      'tavily_search': 'Tavily Search',
      'web_fetch': 'Web Fetch',
      'pdf_extract': 'PDF Extract'
    };
    return names[component] || component;
  }

  private getToolIcon(component: string): string {
    const icons: Record<string, string> = {
      'tavily_search': '🔎',
      'web_fetch': '🌐',
      'pdf_extract': '📑'
    };
    return icons[component] || '🔧';
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
