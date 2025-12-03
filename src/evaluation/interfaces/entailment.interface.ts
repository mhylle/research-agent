import { Claim } from './claim.interface';

export interface SourceEvidence {
  sourceId: string;
  sourceUrl: string;
  relevantText: string;
  similarity: number;
}

export interface EntailmentResult {
  claim: Claim;
  verdict: 'entailed' | 'neutral' | 'contradicted';
  score: number;
  supportingSources: SourceEvidence[];
  contradictingSources: SourceEvidence[];
  reasoning: string;
}
