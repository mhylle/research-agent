import { Component, OnInit, input, output, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConversationService } from '../../../../core/services/conversation.service';
import { Conversation } from '../../../../models/conversation.model';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conversation-list.component.html',
  styleUrl: './conversation-list.component.scss'
})
export class ConversationListComponent implements OnInit {
  // Services
  private conversationService = inject(ConversationService);

  // Inputs
  userId = input.required<string>();

  // Outputs
  conversationSelected = output<string>();
  conversationDeleted = output<string>();

  // Local state
  searchQuery = signal<string>('');
  isCreating = signal<boolean>(false);
  deletingConversationId = signal<string | null>(null);
  private searchTimeout: any = null;

  // Service state (computed from service signals)
  conversations = computed(() => this.conversationService.conversations());
  isLoading = computed(() => this.conversationService.isLoading());
  error = computed(() => this.conversationService.error());

  ngOnInit(): void {
    // Load conversations for the user
    this.loadConversations();
  }

  private async loadConversations(): Promise<void> {
    const userId = this.userId();
    if (userId) {
      await this.conversationService.loadConversations(userId);
    }
  }

  async onCreateConversation(): Promise<void> {
    this.isCreating.set(true);
    try {
      const userId = this.userId();
      const conversation = await this.conversationService.createConversation({
        userId,
        title: 'New Conversation'
      });
      // Emit the new conversation ID for selection
      this.conversationSelected.emit(conversation.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    } finally {
      this.isCreating.set(false);
    }
  }

  onSelectConversation(id: string): void {
    this.conversationSelected.emit(id);
  }

  async onDeleteConversation(event: Event, id: string): Promise<void> {
    event.stopPropagation(); // Prevent selection when clicking delete

    const confirmed = confirm('Are you sure you want to delete this conversation? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    this.deletingConversationId.set(id);
    try {
      await this.conversationService.deleteConversation(id);
      this.conversationDeleted.emit(id);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    } finally {
      this.deletingConversationId.set(null);
    }
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);

    // Debounce the search
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(() => {
      this.performSearch(query);
    }, 300);
  }

  private async performSearch(query: string): Promise<void> {
    const userId = this.userId();
    if (!userId) return;

    if (query.trim() === '') {
      // If search is cleared, reload all conversations
      await this.conversationService.loadConversations(userId);
    } else {
      await this.conversationService.searchConversations(userId, query);
    }
  }

  formatTimestamp(date: Date): string {
    // Validate date
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return 'Unknown date';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    // Format as date for older items
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  truncateTitle(title: string, maxLength: number = 50): string {
    if (!title) return 'Untitled Conversation';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength).trim() + '...';
  }

  trackByConversationId(index: number, conversation: Conversation): string {
    return conversation.id;
  }

  isDeleting(id: string): boolean {
    return this.deletingConversationId() === id;
  }
}
