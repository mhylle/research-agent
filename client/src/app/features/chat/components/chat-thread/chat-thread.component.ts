import {
  Component,
  input,
  output,
  inject,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownService } from '../../../../core/services/markdown.service';
import { ResearchPanelService } from '../../../../core/services/research-panel.service';
import { ResearchSuggestionService } from '../../../../core/services/research-suggestion.service';
import { ChatStreamService } from '../../../../core/services/chat-stream.service';
import { InlineCitationComponent } from '../inline-citation/inline-citation.component';
import { ResearchSuggestionComponent } from '../research-suggestion/research-suggestion.component';
import { Message, Citation } from '../../../../models/conversation.model';

@Component({
  selector: 'app-chat-thread',
  standalone: true,
  imports: [CommonModule, InlineCitationComponent, ResearchSuggestionComponent],
  templateUrl: './chat-thread.component.html',
  styleUrl: './chat-thread.component.scss',
})
export class ChatThreadComponent implements AfterViewChecked {
  // Services
  private markdownService = inject(MarkdownService);
  private researchPanelService = inject(ResearchPanelService);
  private researchSuggestionService = inject(ResearchSuggestionService);
  private chatStreamService = inject(ChatStreamService);

  // Inputs
  messages = input.required<Message[]>();
  isStreaming = input<boolean>(false);
  streamingContent = input<string>('');

  // Outputs
  researchRequested = output<string>();

  // ViewChild for scroll container
  @ViewChild('scrollContainer') private scrollContainer?: ElementRef;

  // Track if we need to scroll
  private shouldScrollToBottom = signal<boolean>(false);

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom()) {
      this.scrollToBottom();
      this.shouldScrollToBottom.set(false);
    }
  }

  /**
   * Scroll to the bottom of the chat thread
   */
  private scrollToBottom(): void {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  /**
   * Trigger scroll on next view check
   */
  triggerScroll(): void {
    this.shouldScrollToBottom.set(true);
  }

  /**
   * Parse markdown content to safe HTML
   */
  parseMarkdown(content: string) {
    return this.markdownService.parseToSafeHtml(content);
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(date: Date): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return '';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60)
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;

    // Format as time for today
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  /**
   * Track messages by id for performance
   */
  trackByMessageId(index: number, message: Message): string {
    return message.id;
  }

  /**
   * Track citations by index for performance
   */
  trackByCitationIndex(index: number, citation: Citation): number {
    return citation.index;
  }

  /**
   * Handle citation click - open research panel with all citations
   */
  onCitationClicked(message: Message, citation: Citation): void {
    if (message.citations && message.citations.length > 0) {
      this.researchPanelService.openWithCitations(
        message.citations,
        citation.index
      );
    }
  }

  /**
   * Get highlighted citation index from service
   */
  getHighlightedCitationIndex(): number | null {
    return this.researchPanelService.highlightedCitationIndex();
  }

  /**
   * Check if message qualifies for research suggestion
   */
  shouldShowSuggestion(message: Message): boolean {
    // For user messages: check if it's a factual/temporal question
    if (message.role === 'user' && !message.messageOptions?.researchEnabled) {
      return this.researchSuggestionService.shouldSuggestResearch(message.content);
    }
    // For assistant messages: check for "[Research recommended]"
    if (message.role === 'assistant') {
      return this.researchSuggestionService.containsResearchRecommendation(message.content);
    }
    return false;
  }

  /**
   * Handle research suggestion click
   */
  onResearchSuggestionClick(content: string): void {
    this.researchRequested.emit(content);
  }

  /**
   * Check if a specific message is currently being researched
   */
  isMessageResearching(messageId: string): boolean {
    return this.chatStreamService.activeResearchMessageId() === messageId;
  }

  /**
   * Get research progress for a specific message
   */
  getResearchProgress(messageId: string): number | null {
    if (this.isMessageResearching(messageId)) {
      return this.chatStreamService.researchProgress();
    }
    return null;
  }

  /**
   * Get current research stage
   */
  researchStage = computed(() => this.chatStreamService.researchStage());
}
