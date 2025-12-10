import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResearchPanelService } from '../../../../core/services/research-panel.service';
import { Citation } from '../../../../models/conversation.model';

@Component({
  selector: 'app-research-side-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './research-side-panel.component.html',
  styleUrl: './research-side-panel.component.scss'
})
export class ResearchSidePanelComponent {
  private researchPanelService = inject(ResearchPanelService);

  // Public computed signals from service
  isOpen = computed(() => this.researchPanelService.isOpen());
  citations = computed(() => this.researchPanelService.citations());
  highlightedCitationIndex = computed(() => this.researchPanelService.highlightedCitationIndex());
  isResearching = computed(() => this.researchPanelService.isResearching());
  researchStage = computed(() => this.researchPanelService.researchStage());
  researchProgress = computed(() => this.researchPanelService.researchProgress());

  close(): void {
    this.researchPanelService.close();
  }

  openUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  trackByCitationIndex(index: number, citation: Citation): number {
    return citation.index;
  }
}
