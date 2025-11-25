import { Injectable, Logger } from '@nestjs/common';
import {
  Orchestrator,
  ResearchResult,
} from '../orchestration/orchestrator.service';
import { ResearchResultService } from './research-result.service';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    private orchestrator: Orchestrator,
    private resultService: ResearchResultService,
  ) {}

  async executeResearch(query: string): Promise<ResearchResult> {
    const result = await this.orchestrator.executeResearch(query);

    // Persist the research result to database
    try {
      await this.resultService.save({
        logId: result.logId,
        planId: result.planId,
        query,
        answer: result.answer,
        sources: result.sources,
        metadata: result.metadata,
      });
      this.logger.log(`Research result saved for logId: ${result.logId}`);
    } catch (error) {
      this.logger.error(`Failed to save research result: ${error}`);
      // Don't fail the entire request if saving fails
    }

    return result;
  }
}
