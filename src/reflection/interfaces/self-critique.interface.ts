export interface SelfCritique {
  overallAssessment: string;
  strengths: string[];
  weaknesses: string[];
  suggestedImprovements: string[];
  criticalIssues: string[];
  confidence: number; // Confidence in the critique itself (0-1)
}
