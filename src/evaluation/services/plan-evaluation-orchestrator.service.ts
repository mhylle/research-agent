import { Injectable, Logger } from '@nestjs/common';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { ScoreAggregatorService } from './score-aggregator.service';
import { EscalationHandlerService } from './escalation-handler.service';
import { EvaluationService } from './evaluation.service';
import {
  PlanEvaluationResult,
  PlanAttempt,
  IterationDecision,
  DEFAULT_EVALUATION_CONFIG,
  DimensionScores,
} from '../interfaces';

export interface PlanEvaluationInput {
  query: string;
  plan: any;
}

@Injectable()
export class PlanEvaluationOrchestratorService {
  private readonly logger = new Logger(PlanEvaluationOrchestratorService.name);
  private readonly config = DEFAULT_EVALUATION_CONFIG;

  constructor(
    private readonly panelEvaluator: PanelEvaluatorService,
    private readonly scoreAggregator: ScoreAggregatorService,
    private readonly escalationHandler: EscalationHandlerService,
    private readonly evaluationService: EvaluationService,
  ) {}

  async evaluatePlan(input: PlanEvaluationInput): Promise<PlanEvaluationResult> {
    return this.evaluationService.evaluateWithFallback(
      () => this.doEvaluatePlan(input),
      this.createFallbackResult(),
      'plan-evaluation-orchestrator',
    );
  }

  private async doEvaluatePlan(input: PlanEvaluationInput): Promise<PlanEvaluationResult> {
    console.log('[PlanEvaluationOrchestrator] doEvaluatePlan started');
    console.log('[PlanEvaluationOrchestrator] Input:', JSON.stringify({ query: input.query, planId: input.plan.id }, null, 2));

    const attempts: PlanAttempt[] = [];
    let currentPlan = input.plan;
    let escalatedToLargeModel = false;

    const maxAttempts = this.config.planEvaluation.maxAttempts;
    const passThreshold = this.config.planEvaluation.passThreshold;

    console.log(`[PlanEvaluationOrchestrator] Config: maxAttempts=${maxAttempts}, passThreshold=${passThreshold}`);

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      console.log(`[PlanEvaluationOrchestrator] Starting attempt ${attemptNumber}/${maxAttempts}`);
      this.logger.log(`Plan evaluation attempt ${attemptNumber}/${maxAttempts}`);

      // Step 1: Panel evaluation
      const evaluatorResults = await this.panelEvaluator.evaluateWithPanel(
        ['intentAnalyst', 'coverageChecker'],
        {
          query: input.query,
          plan: currentPlan,
          searchQueries: currentPlan.searchQueries || [],
        },
      );

      // Step 2: Aggregate scores
      const aggregated = this.scoreAggregator.aggregateScores(evaluatorResults);
      const overallScore = this.scoreAggregator.calculateOverallScore(aggregated.scores);

      // Step 3: Check escalation triggers
      const escalationTrigger = this.scoreAggregator.checkEscalationTriggers(
        aggregated,
        evaluatorResults,
        passThreshold,
      );

      let finalScores = aggregated.scores;
      let finalConfidence = aggregated.confidence;
      let passed = overallScore >= passThreshold;
      let escalation;

      // Step 4: Escalate if needed
      if (escalationTrigger) {
        this.logger.log(`Escalating due to: ${escalationTrigger}`);
        escalatedToLargeModel = true;

        escalation = await this.escalationHandler.escalate({
          trigger: escalationTrigger,
          query: input.query,
          content: currentPlan,
          panelResults: evaluatorResults,
        });

        // Use escalation results
        if (Object.keys(escalation.scores).length > 0) {
          finalScores = { ...finalScores, ...escalation.scores };
        }
        passed = escalation.finalVerdict === 'pass';
      }

      // Build attempt record
      const attempt: PlanAttempt = {
        attemptNumber,
        timestamp: new Date(),
        plan: currentPlan,
        evaluatorResults,
        aggregatedScores: finalScores,
        aggregatedConfidence: finalConfidence,
        passed,
        escalation,
      };

      // Step 5: Decide on iteration
      if (!passed && attemptNumber < maxAttempts) {
        attempt.iterationDecision = this.decideIteration(evaluatorResults, finalScores, passThreshold);
        this.logger.log(`Iteration decision: ${attempt.iterationDecision.mode}`);
        // In real implementation, would regenerate plan here
        // For now, we just continue with same plan (caller responsible for regeneration)
      }

      attempts.push(attempt);

      // If passed, we're done
      if (passed) {
        this.logger.log(`Plan passed on attempt ${attemptNumber}`);
        break;
      }
    }

    const lastAttempt = attempts[attempts.length - 1];

    return {
      passed: lastAttempt.passed,
      scores: lastAttempt.aggregatedScores,
      confidence: lastAttempt.aggregatedConfidence,
      evaluationSkipped: false,
      attempts,
      totalIterations: attempts.length,
      escalatedToLargeModel,
    };
  }

  private decideIteration(
    evaluatorResults: any[],
    scores: DimensionScores,
    threshold: number,
  ): IterationDecision {
    const critiques = evaluatorResults
      .filter(r => r.critique)
      .map(r => r.critique);

    // Analyze which dimensions are failing
    const failingDimensions = Object.entries(scores)
      .filter(([_, score]) => typeof score === 'number' && score < threshold)
      .map(([dim]) => dim);

    // Decide iteration mode
    let mode: IterationDecision['mode'] = 'targeted_fix';
    if (failingDimensions.length > 2) {
      mode = 'full_regeneration';
    }

    return {
      mode,
      specificIssues: failingDimensions.map(dim => ({
        issue: `${dim} score too low`,
        fix: `Improve ${dim}`,
      })),
      feedbackToPlanner: critiques.join('\n'),
    };
  }

  private createFallbackResult(): PlanEvaluationResult {
    return {
      passed: true,
      scores: {},
      confidence: 0,
      evaluationSkipped: true,
      skipReason: 'Evaluation skipped due to error',
      attempts: [],
      totalIterations: 0,
      escalatedToLargeModel: false,
    };
  }
}
