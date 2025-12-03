import { Claim } from '../../evaluation/interfaces/claim.interface';

export interface Gap {
  id: string;
  type: 'missing_info' | 'weak_claim' | 'contradiction' | 'incomplete_coverage';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  suggestedAction: string;
  relatedClaim?: Claim;
  confidence: number;
}
