export interface Conversation {
  id: string;
  userId: string;
  title: string;
  summary?: string;
  tokenCount: number;
  createdAt: Date;
  updatedAt: Date;
  messages?: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageOptions: MessageOptions;
  researchLogId?: string;
  citations?: Citation[];
  tokenCount: number;
  createdAt: Date;
  editedAt?: Date;
}

export interface MessageOptions {
  researchEnabled: boolean;
  contextScope?: 'recent' | 'full' | 'custom';
  selectedMessageIds?: string[];
}

export interface Citation {
  index: number;
  url: string;
  title: string;
  snippet: string;
}

// DTOs for API calls
export interface CreateConversationDto {
  userId: string;
  title?: string;
}

export interface UpdateConversationDto {
  title?: string;
}

export interface CreateMessageDto {
  content: string;
  role: 'user' | 'assistant' | 'system';
  messageOptions?: MessageOptions;
}

// Paginated response type
export interface PaginatedConversations {
  data: Conversation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
