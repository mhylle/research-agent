import { Component, inject, signal, effect, OnInit, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ConversationService } from '../../core/services/conversation.service';
import { ChatStreamService } from '../../core/services/chat-stream.service';
import { ResearchPanelService } from '../../core/services/research-panel.service';
import { ConversationListComponent } from './components/conversation-list/conversation-list.component';
import { ChatThreadComponent } from './components/chat-thread/chat-thread.component';
import { ChatInputComponent, MessageSentEvent } from './components/chat-input/chat-input.component';
import { ResearchSidePanelComponent } from './components/research-side-panel/research-side-panel.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    ConversationListComponent,
    ChatThreadComponent,
    ChatInputComponent,
    ResearchSidePanelComponent
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  conversationService = inject(ConversationService);
  private chatStreamService = inject(ChatStreamService);
  private researchPanelService = inject(ResearchPanelService);

  // ViewChild for chat thread to trigger scroll
  @ViewChild(ChatThreadComponent) chatThread?: ChatThreadComponent;

  // User ID (simple string for now - should come from auth)
  userId = signal<string>('demo-user');

  // Route parameter signal
  conversationId = signal<string | null>(null);

  // Mobile sidebar state
  isSidebarVisible = signal<boolean>(false);

  // Computed signals from services
  currentConversation = computed(() => this.conversationService.currentConversation());
  messages = computed(() => this.currentConversation()?.messages || []);
  isLoading = computed(() => this.conversationService.isLoading());
  error = computed(() => this.conversationService.error());

  // Streaming state
  isStreaming = computed(() => this.chatStreamService.isStreaming());
  streamingContent = computed(() => this.chatStreamService.streamingContent());
  streamError = computed(() => this.chatStreamService.error());
  connectionStatus = computed(() => this.chatStreamService.connectionStatus());

  // Research panel state
  isPanelOpen = computed(() => this.researchPanelService.isOpen());

  constructor() {
    // Watch for route param changes
    effect(() => {
      const id = this.conversationId();
      if (id) {
        this.loadConversation(id);
        // Hide sidebar on mobile when conversation is selected
        if (window.innerWidth <= 768) {
          this.isSidebarVisible.set(false);
        }
      }
    });

    // Watch for streaming completion
    effect(() => {
      const streaming = this.isStreaming();
      const streamContent = this.streamingContent();
      const currentMessageId = this.chatStreamService.currentMessageId();

      if (!streaming && streamContent && currentMessageId) {
        // Update the assistant message with final content
        this.conversationService.updateMessageInConversation(
          currentMessageId,
          streamContent
        );

        // Clear streaming state
        this.chatStreamService.clearStream();

        // Trigger scroll to bottom
        if (this.chatThread) {
          this.chatThread.triggerScroll();
        }
      }
    });
  }

  ngOnInit(): void {
    // Get conversation ID from route params
    this.route.params.subscribe(params => {
      this.conversationId.set(params['conversationId'] || null);
    });
  }

  /**
   * Load a specific conversation
   */
  private async loadConversation(id: string): Promise<void> {
    await this.conversationService.selectConversation(id);
  }

  /**
   * Handle conversation selection from sidebar
   */
  async onConversationSelected(id: string): Promise<void> {
    await this.router.navigate(['/chat', id]);
  }

  /**
   * Handle conversation deletion
   */
  async onConversationDeleted(id: string): Promise<void> {
    // If current conversation was deleted, navigate to chat home
    if (this.conversationId() === id) {
      await this.router.navigate(['/chat']);
      this.conversationService.clearCurrentConversation();
    }
  }

  /**
   * Handle message sent from chat input
   */
  async onMessageSent(event: MessageSentEvent): Promise<void> {
    await this.sendMessage(event.content, event.researchEnabled);
  }

  /**
   * Send a message (used by both chat input and research suggestion)
   */
  private async sendMessage(content: string, researchEnabled: boolean = false): Promise<void> {
    const currentConvId = this.conversationId();

    // If no conversation is selected, create one first
    let conversationId = currentConvId;
    if (!conversationId) {
      try {
        const newConversation = await this.conversationService.createConversation({
          userId: this.userId(),
          title: this.extractTitleFromMessage(content)
        });
        conversationId = newConversation.id;
        await this.router.navigate(['/chat', conversationId]);
      } catch (error) {
        console.error('Failed to create conversation:', error);
        return;
      }
    }

    try {
      // Add user message
      const userMessage = await this.conversationService.addMessage(conversationId, {
        role: 'user',
        content: content,
        messageOptions: {
          researchEnabled: researchEnabled
        }
      });

      // Trigger scroll after adding user message
      if (this.chatThread) {
        this.chatThread.triggerScroll();
      }

      // Create placeholder assistant message
      const assistantMessage = await this.conversationService.addMessage(conversationId, {
        role: 'assistant',
        content: '', // Will be filled by streaming
        messageOptions: {
          researchEnabled: false
        }
      });

      // Start streaming the response
      this.chatStreamService.startStream(assistantMessage.id);

      // If research is enabled, start tracking research progress
      if (researchEnabled) {
        // Note: The researchLogId will be set by the backend after the message is processed
        // We'll need to poll or wait for the researchLogId to be available
        // For now, we'll check if there's a researchLogId in the user message
        if (userMessage.researchLogId) {
          this.researchPanelService.startResearchTracking(userMessage.researchLogId);
          this.researchPanelService.isOpen.set(true);
        }
      }

      // Trigger scroll when streaming starts
      if (this.chatThread) {
        this.chatThread.triggerScroll();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      this.conversationService.error.set('Failed to send message. Please try again.');
    }
  }

  /**
   * Handle research requested from suggestion component
   */
  onResearchRequested(content: string): void {
    // Re-send the message with research enabled
    this.sendMessage(content, true);
  }

  /**
   * Extract a title from the first message
   */
  private extractTitleFromMessage(content: string): string {
    // Take first 50 characters as title
    const title = content.trim().substring(0, 50);
    return title.length < content.length ? title + '...' : title;
  }

  /**
   * Toggle mobile sidebar visibility
   */
  toggleSidebar(): void {
    this.isSidebarVisible.update(visible => !visible);
  }

  /**
   * Check if we should show the empty state
   */
  showEmptyState(): boolean {
    return !this.conversationId() && !this.isLoading();
  }

  /**
   * Clear conversation service error
   */
  clearConversationError(): void {
    this.conversationService.clearError();
  }

  /**
   * Clear streaming error
   */
  clearStreamError(): void {
    this.chatStreamService.error.set(null);
  }

  /**
   * Retry streaming connection
   */
  retryStream(): void {
    this.chatStreamService.retryStream();
  }

  /**
   * Get connection status indicator text
   */
  getConnectionStatusText(): string {
    const status = this.connectionStatus();
    const statusTexts: Record<string, string> = {
      'disconnected': 'Disconnected',
      'connecting': 'Connecting...',
      'connected': 'Connected',
      'error': 'Connection Error'
    };
    return statusTexts[status] || status;
  }

  /**
   * Get connection status CSS class
   */
  getConnectionStatusClass(): string {
    const status = this.connectionStatus();
    return `connection-status--${status}`;
  }
}
