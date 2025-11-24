import { Injectable } from '@nestjs/common';
import {
  Orchestrator,
  ResearchResult,
} from '../orchestration/orchestrator.service';

@Injectable()
export class ResearchService {
  constructor(private orchestrator: Orchestrator) {}

  async executeResearch(query: string): Promise<ResearchResult> {
    return this.orchestrator.executeResearch(query);
  }
}
