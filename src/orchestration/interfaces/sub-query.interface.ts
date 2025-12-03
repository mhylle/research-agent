export interface SubQuery {
  id: string;
  text: string;
  order: number; // Execution order
  dependencies: string[]; // IDs of sub-queries this depends on
  type: 'factual' | 'analytical' | 'comparative' | 'temporal';
  priority: 'high' | 'medium' | 'low';
  estimatedComplexity: number; // 1-5 scale
}
