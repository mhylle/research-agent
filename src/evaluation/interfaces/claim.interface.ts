export interface SubstantiveWord {
  word: string;
  type: 'noun' | 'verb' | 'numeral' | 'proper_noun';
  position: number;
  importance: number;
}

export interface Claim {
  id: string;
  text: string;
  type: 'factual' | 'comparative' | 'temporal' | 'causal' | 'opinion';
  substantiveWords: SubstantiveWord[];
  sourceSpan: { start: number; end: number };
}
