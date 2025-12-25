import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Conversation,
  Message,
  PaginatedConversations,
  CreateConversationDto,
  UpdateConversationDto,
  CreateMessageDto
} from '../../models/conversation.model';

/**
 * Loading state types for distinguishing between initial load and refresh
 */
export type LoadingState = 'idle' | 'initial-load' | 'refreshing' | 'loading';

@Injectable({ providedIn: 'root' })
export class ConversationService {
  private http = inject(HttpClient);

  // State signals
  conversations = signal<Conversation[]>([]);
  currentConversation = signal<Conversation | null>(null);
  isLoading = signal<boolean>(false);
  loadingState = signal<LoadingState>('idle');
  error = signal<string | null>(null);

  // Pagination state
  currentPage = signal<number>(1);
  pageSize = signal<number>(20);
  totalConversations = signal<number>(0);

  // Computed signals
  hasConversations = computed(() => this.conversations().length > 0);
  totalPages = computed(() => Math.ceil(this.totalConversations() / this.pageSize()));

  // API base URL
  private readonly apiUrl = `${environment.apiUrl}/conversations`;

  // Retry configuration
  private readonly maxRetries = 2;
  private readonly retryDelay = 1000; // ms
  private readonly retryableStatusCodes = [408, 429, 500, 502, 503, 504];

  /**
   * Load conversations for a user with pagination
   */
  async loadConversations(userId: string, page?: number, isRefresh: boolean = false): Promise<void> {
    this.isLoading.set(true);
    this.loadingState.set(this.conversations().length > 0 || isRefresh ? 'refreshing' : 'initial-load');
    this.error.set(null);

    if (page !== undefined) {
      this.currentPage.set(page);
    }

    try {
      const params = new HttpParams()
        .set('userId', userId)
        .set('page', this.currentPage().toString())
        .set('limit', this.pageSize().toString());

      const response = await this.retryRequest(() =>
        firstValueFrom(
          this.http.get<PaginatedConversations>(this.apiUrl, { params })
        )
      );

      this.conversations.set(response.data);
      this.totalConversations.set(response.total);
    } catch (err: any) {
      this.handleError(err, 'load conversations');
    } finally {
      this.isLoading.set(false);
      this.loadingState.set('idle');
    }
  }

  /**
   * Create a new conversation
   */
  async createConversation(dto: CreateConversationDto): Promise<Conversation> {
    this.isLoading.set(true);
    this.loadingState.set('loading');
    this.error.set(null);

    try {
      const conversation = await this.retryRequest(() =>
        firstValueFrom(
          this.http.post<Conversation>(this.apiUrl, dto)
        )
      );

      // Add to conversations list at the beginning
      this.conversations.update(prev => [conversation, ...prev]);
      this.totalConversations.update(count => count + 1);

      return conversation;
    } catch (err: any) {
      this.handleError(err, 'create conversation');
      throw err;
    } finally {
      this.isLoading.set(false);
      this.loadingState.set('idle');
    }
  }

  /**
   * Load a specific conversation with all its messages
   */
  async selectConversation(id: string): Promise<void> {
    this.isLoading.set(true);
    this.loadingState.set('loading');
    this.error.set(null);

    try {
      const conversation = await this.retryRequest(() =>
        firstValueFrom(
          this.http.get<Conversation>(`${this.apiUrl}/${id}`)
        )
      );

      // Convert date strings to Date objects
      conversation.createdAt = new Date(conversation.createdAt);
      conversation.updatedAt = new Date(conversation.updatedAt);

      if (conversation.messages) {
        conversation.messages = conversation.messages.map(msg => ({
          ...msg,
          createdAt: new Date(msg.createdAt),
          editedAt: msg.editedAt ? new Date(msg.editedAt) : undefined
        }));
      }

      this.currentConversation.set(conversation);
    } catch (err: any) {
      this.handleError(err, 'load conversation');
    } finally {
      this.isLoading.set(false);
      this.loadingState.set('idle');
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(id: string): Promise<void> {
    this.isLoading.set(true);
    this.loadingState.set('loading');
    this.error.set(null);

    try {
      await this.retryRequest(() =>
        firstValueFrom(
          this.http.delete(`${this.apiUrl}/${id}`)
        )
      );

      // Remove from conversations list
      this.conversations.update(prev => prev.filter(c => c.id !== id));
      this.totalConversations.update(count => count - 1);

      // Clear current conversation if it's the deleted one
      if (this.currentConversation()?.id === id) {
        this.currentConversation.set(null);
      }
    } catch (err: any) {
      this.handleError(err, 'delete conversation');
      throw err;
    } finally {
      this.isLoading.set(false);
      this.loadingState.set('idle');
    }
  }

  /**
   * Update conversation title
   */
  async updateTitle(id: string, title: string): Promise<void> {
    this.isLoading.set(true);
    this.loadingState.set('loading');
    this.error.set(null);

    try {
      const dto: UpdateConversationDto = { title };
      const updatedConversation = await this.retryRequest(() =>
        firstValueFrom(
          this.http.patch<Conversation>(`${this.apiUrl}/${id}`, dto)
        )
      );

      // Update in conversations list
      this.conversations.update(prev =>
        prev.map(c => c.id === id ? { ...c, title } : c)
      );

      // Update current conversation if it's the updated one
      if (this.currentConversation()?.id === id) {
        this.currentConversation.update(current =>
          current ? { ...current, title } : null
        );
      }
    } catch (err: any) {
      this.handleError(err, 'update conversation title');
      throw err;
    } finally {
      this.isLoading.set(false);
      this.loadingState.set('idle');
    }
  }

  /**
   * Search conversations by query
   */
  async searchConversations(userId: string, query: string): Promise<void> {
    this.isLoading.set(true);
    this.loadingState.set('loading');
    this.error.set(null);

    try {
      const params = new HttpParams()
        .set('userId', userId)
        .set('search', query)
        .set('page', '1')
        .set('limit', this.pageSize().toString());

      const response = await this.retryRequest(() =>
        firstValueFrom(
          this.http.get<PaginatedConversations>(this.apiUrl, { params })
        )
      );

      this.conversations.set(response.data);
      this.totalConversations.set(response.total);
      this.currentPage.set(1);
    } catch (err: any) {
      this.handleError(err, 'search conversations');
    } finally {
      this.isLoading.set(false);
      this.loadingState.set('idle');
    }
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.error.set(null);
  }

  /**
   * Clear current conversation
   */
  clearCurrentConversation(): void {
    this.currentConversation.set(null);
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(conversationId: string, dto: CreateMessageDto): Promise<Message> {
    this.isLoading.set(true);
    this.loadingState.set('loading');
    this.error.set(null);

    try {
      const message = await this.retryRequest(() =>
        firstValueFrom(
          this.http.post<Message>(`${this.apiUrl}/${conversationId}/messages`, dto)
        )
      );

      // Convert date strings to Date objects
      message.createdAt = new Date(message.createdAt);
      if (message.editedAt) {
        message.editedAt = new Date(message.editedAt);
      }

      // Add message to current conversation if it matches
      if (this.currentConversation()?.id === conversationId) {
        this.currentConversation.update(current => {
          if (!current) return null;
          return {
            ...current,
            messages: [...(current.messages || []), message]
          };
        });
      }

      return message;
    } catch (err: any) {
      this.handleError(err, 'add message');
      throw err;
    } finally {
      this.isLoading.set(false);
      this.loadingState.set('idle');
    }
  }

  /**
   * Update a message in the current conversation
   */
  updateMessageInConversation(messageId: string, content: string): void {
    this.currentConversation.update(current => {
      if (!current || !current.messages) return current;

      return {
        ...current,
        messages: current.messages.map(msg =>
          msg.id === messageId ? { ...msg, content } : msg
        )
      };
    });
  }

  /**
   * Retry a request with exponential backoff
   */
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      const httpError = error as HttpErrorResponse;

      // Check if error is retryable and we haven't exceeded max retries
      const isRetryable = this.isRetryableError(httpError);
      const canRetry = retryCount < this.maxRetries;

      if (isRetryable && canRetry) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        console.log(`[ConversationService] Retrying request in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);

        await this.delay(delay);
        return this.retryRequest(requestFn, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: HttpErrorResponse): boolean {
    // Network errors (status 0) are retryable
    if (error.status === 0) {
      return true;
    }

    // Check specific status codes
    return this.retryableStatusCodes.includes(error.status);
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle errors with contextual messages based on HTTP status codes
   */
  private handleError(error: any, operation: string): void {
    const httpError = error as HttpErrorResponse;

    let errorMessage: string;

    if (httpError.status === 0) {
      // Network error
      errorMessage = `🌐 Network error while trying to ${operation}. Please check your internet connection.`;
    } else if (httpError.status === 400) {
      // Bad request
      errorMessage = `⚠️ Invalid request to ${operation}. Please check your input.`;
    } else if (httpError.status === 401 || httpError.status === 403) {
      // Authentication/Authorization error
      errorMessage = `🔒 You don't have permission to ${operation}. Please sign in again.`;
    } else if (httpError.status === 404) {
      // Not found
      errorMessage = `🔍 Could not find the resource to ${operation}. It may have been deleted.`;
    } else if (httpError.status === 408) {
      // Timeout
      errorMessage = `⏱️ Request to ${operation} timed out. Please try again.`;
    } else if (httpError.status === 429) {
      // Too many requests
      errorMessage = `⚡ Too many requests. Please wait a moment before trying to ${operation} again.`;
    } else if (httpError.status >= 500) {
      // Server error
      errorMessage = `🔧 Server error while trying to ${operation}. Our team has been notified.`;
    } else {
      // Generic error
      errorMessage = httpError.error?.message || httpError.message || `Failed to ${operation}. Please try again.`;
    }

    console.error(`[ConversationService] Error during ${operation}:`, error);
    this.error.set(errorMessage);
  }
}
