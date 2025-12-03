export interface QueryAspect {
  id: string;
  description: string;
  keywords: string[];
  answered: boolean;
  confidence: number; // How well it's answered (0-1)
  supportingSources: string[]; // Source IDs
}
