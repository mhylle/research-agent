import { Injectable, signal } from '@angular/core';
import { Citation } from '../../models/conversation.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ResearchPanelService {
  // Panel state
  isOpen = signal<boolean>(false);
  highlightedCitationIndex = signal<number | null>(null);

  // Current citations (from selected message)
  citations = signal<Citation[]>([]);

  // Research progress state
  activeResearchLogId = signal<string | null>(null);
  isResearching = signal<boolean>(false);
  researchStage = signal<string | null>(null);
  researchProgress = signal<number>(0); // 0-100

  // SSE connection for research progress
  private eventSource: EventSource | null = null;

  /**
   * Open panel with citations from a message
   */
  openWithCitations(citations: Citation[], highlightIndex?: number): void {
    this.citations.set(citations);
    this.highlightedCitationIndex.set(highlightIndex ?? null);
    this.isOpen.set(true);
  }

  /**
   * Highlight a specific citation
   */
  highlightCitation(index: number): void {
    this.highlightedCitationIndex.set(index);
    if (!this.isOpen()) {
      this.isOpen.set(true);
    }
  }

  /**
   * Close the panel
   */
  close(): void {
    this.isOpen.set(false);
    this.highlightedCitationIndex.set(null);
  }

  /**
   * Toggle panel open/closed
   */
  toggle(): void {
    this.isOpen.update(v => !v);
  }

  /**
   * Start tracking research progress for a logId
   */
  startResearchTracking(logId: string): void {
    this.disconnectResearch();
    this.activeResearchLogId.set(logId);
    this.isResearching.set(true);
    this.researchProgress.set(0);
    this.researchStage.set('Initializing...');

    // Connect to research SSE (existing log stream)
    const url = `${environment.apiUrl}/research/stream/${logId}`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('planning_started', () => {
      this.researchStage.set('Planning research...');
      this.researchProgress.set(10);
    });

    this.eventSource.addEventListener('plan_created', () => {
      this.researchStage.set('Plan created');
      this.researchProgress.set(20);
    });

    this.eventSource.addEventListener('phase_started', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      this.researchStage.set(`Phase: ${data.phaseName || 'Processing'}`);
      // Map phases to progress: assume 3 phases = 20% + (phase * 25%)
      const phaseProgress = 20 + ((this.calculatePhaseNumber(data.phaseName) || 1) * 25);
      this.researchProgress.set(Math.min(phaseProgress, 95));
    });

    this.eventSource.addEventListener('step_started', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      this.researchStage.set(`Running: ${data.toolName || 'Processing'}`);
    });

    this.eventSource.addEventListener('session_completed', () => {
      this.isResearching.set(false);
      this.researchProgress.set(100);
      this.researchStage.set('Research complete');
      this.disconnectResearch();
    });

    this.eventSource.addEventListener('session_failed', () => {
      this.isResearching.set(false);
      this.researchStage.set('Research failed');
      this.disconnectResearch();
    });

    this.eventSource.onerror = () => {
      this.isResearching.set(false);
      this.researchStage.set('Connection error');
      this.disconnectResearch();
    };
  }

  /**
   * Disconnect research tracking
   */
  disconnectResearch(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Clear all state
   */
  clearState(): void {
    this.close();
    this.citations.set([]);
    this.disconnectResearch();
    this.activeResearchLogId.set(null);
    this.isResearching.set(false);
    this.researchStage.set(null);
    this.researchProgress.set(0);
  }

  /**
   * Helper to map phase name to approximate phase number
   */
  private calculatePhaseNumber(phaseName: string | undefined): number {
    if (!phaseName) return 1;
    const lower = phaseName.toLowerCase();
    if (lower.includes('retrieval') || lower.includes('search') || lower.includes('fetch')) {
      return 1;
    }
    if (lower.includes('evaluation') || lower.includes('assess') || lower.includes('quality')) {
      return 2;
    }
    if (lower.includes('synthesis') || lower.includes('answer') || lower.includes('generate')) {
      return 3;
    }
    return 1; // Default to first phase
  }
}
