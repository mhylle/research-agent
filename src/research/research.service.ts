import { Injectable, Logger } from '@nestjs/common';
import {
  Orchestrator,
  ResearchResult,
  AgenticResearchResult,
} from '../orchestration/orchestrator.service';
import { ResearchResultService } from './research-result.service';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    private orchestrator: Orchestrator,
    private resultService: ResearchResultService,
  ) {}

  async executeResearch(
    query: string,
    logId?: string,
  ): Promise<ResearchResult> {
    // Persistence is now handled by Orchestrator before session_completed event
    // to fix race condition where client fetches before save completes
    const result = await this.orchestrator.executeResearch(query, logId);
    return result;
  }

  /**
   * Start research in background and return logId immediately for SSE connection
   */
  startResearchInBackground(query: string, logId: string): void {
    // Fire and forget - don't await
    this.executeResearch(query, logId).catch((error) => {
      this.logger.error(
        `Background research failed for logId ${logId}: ${error}`,
      );
    });
  }

  /**
   * Execute agentic research with full reflection and refinement pipeline.
   */
  async executeAgenticResearch(
    query: string,
    logId?: string,
  ): Promise<AgenticResearchResult> {
    // Persistence is now handled by Orchestrator before session_completed event
    // to fix race condition where client fetches before save completes
    const result = await this.orchestrator.orchestrateAgenticResearch(
      query,
      logId,
    );
    return result;
  }
}
