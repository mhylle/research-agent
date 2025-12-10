export interface MessageOptions {
  researchEnabled: boolean;
  contextScope?: 'recent' | 'full' | 'custom';
  selectedMessageIds?: string[];
}
