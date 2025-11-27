import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  async evaluatePlan(plan: any, query: string): Promise<any> {
    this.logger.log('Plan evaluation not yet implemented');
    return { passed: true, scores: {}, evaluationSkipped: true };
  }
}
