export interface ContextOptions {
  scope: 'recent' | 'full' | 'custom';
  selectedMessageIds?: string[];
  maxTokens?: number;
}
