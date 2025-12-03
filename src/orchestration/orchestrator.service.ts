// src/orchestration/orchestrator.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PlannerService } from './planner.service';
import { LogService } from '../logging/log.service';
import { EventCoordinatorService } from './services/event-coordinator.service';
import { ResultExtractorService } from './services/result-extractor.service';
import { EvaluationCoordinatorService } from './services/evaluation-coordinator.service';
import { PhaseExecutorRegistry } from './phase-executors/phase-executor-registry';
import { WorkingMemoryService } from './services/working-memory.service';
import { QueryDecomposerService } from './services/query-decomposer.service';
import { OllamaService } from '../llm/ollama.service';
import { Plan } from './interfaces/plan.interface';
import { Phase, PhaseResult, StepResult } from './interfaces/phase.interface';
import { LogEventType } from '../logging/interfaces/log-event-type.enum';
import {
  FailureContext,
  RecoveryDecision,
} from './interfaces/recovery.interface';
import { ConfidenceResult } from '../evaluation/interfaces/confidence.interface';
import { DecompositionResult, SubQuery } from './interfaces';

export interface ResearchResult {
  logId: string;
  planId: string;
  answer: string;
  sources: Array<{ url: string; title: string; relevance: string }>;
  metadata: {
    totalExecutionTime: number;
    phases: Array<{ phase: string; executionTime: number }>;
    decomposition?: DecompositionResult;
    subQueryResults?: Map<string, SubQueryResult>;
  };
  confidence?: ConfidenceResult;
}

export interface SubQueryResult {
  subQueryId: string;
  answer: string;
  sources: Array<{ url: string; title: string; relevance: string }>;
  confidence?: number;
}

@Injectable()
export class Orchestrator {
  constructor(
    private plannerService: PlannerService,
    private logService: LogService,
    private eventEmitter: EventEmitter2,
    private eventCoordinator: EventCoordinatorService,
    private resultExtractor: ResultExtractorService,
    private evaluationCoordinator: EvaluationCoordinatorService,
    private phaseExecutorRegistry: PhaseExecutorRegistry,
    private workingMemory: WorkingMemoryService,
    private queryDecomposer: QueryDecomposerService,
    private llmService: OllamaService,
  ) {}

  /**
   * Main entry point for research execution.
   * Decomposes complex queries and routes to appropriate execution path.
   */
  async executeResearch(
    query: string,
    logId?: string,
  ): Promise<ResearchResult> {
    logId = logId || randomUUID();
    const startTime = Date.now();

    // Initialize working memory for this research session
    this.workingMemory.initialize(logId, query);

    try {
      // Emit session start
      await this.eventCoordinator.emit(logId, 'session_started', { query });

      // Step 1: Decompose query to determine complexity
      const decomposition = await this.queryDecomposer.decomposeQuery(query, logId);

      // Store decomposition in working memory
      this.workingMemory.setScratchPadValue(logId, 'decomposition', decomposition);

      let result: ResearchResult;

      if (!decomposition.isComplex) {
        // Simple query - execute normal flow
        console.log('[Orchestrator] Simple query detected, executing normal flow');
        result = await this.executeSimpleQuery(query, logId, startTime);
      } else {
        // Complex query - execute sub-queries according to plan
        console.log(`[Orchestrator] Complex query detected with ${decomposition.subQueries.length} sub-queries`);
        result = await this.executeDecomposedQuery(decomposition, logId, startTime);
      }

      // Add decomposition to metadata
      result.metadata.decomposition = decomposition;

      return result;
    } finally {
      // Cleanup working memory after completion or error
      this.workingMemory.cleanup(logId);
    }
  }

  /**
   * Execute a simple (non-decomposed) query using the standard research flow.
   */
  private async executeSimpleQuery(
    query: string,
    logId: string,
    startTime: number,
  ): Promise<ResearchResult> {
    const phaseMetrics: Array<{ phase: string; executionTime: number }> = [];

    // Add initial sub-goals based on query analysis
    this.addQuerySubGoals(query, logId);

    // Create and evaluate plan
    const MAX_PLAN_ATTEMPTS = 3;
    let plan = await this.plannerService.createPlan(query, logId);
    let planAttempt = 1;

    console.log(
      `[Orchestrator] Plan created with ${plan.phases.length} phases, evaluating...`,
    );

    // PLAN EVALUATION WITH FEEDBACK LOOP
    while (planAttempt <= MAX_PLAN_ATTEMPTS) {
      const searchQueries = this.resultExtractor.extractSearchQueries(plan);
      const evaluationResult = await this.evaluationCoordinator.evaluatePlan(
        logId,
        plan,
        searchQueries,
      );

      if (evaluationResult.passed || evaluationResult.evaluationSkipped) {
        console.log(
          `[Orchestrator] Plan evaluation passed on attempt ${planAttempt}`,
        );
        break;
      }

      console.log(
        `[Orchestrator] Plan evaluation FAILED on attempt ${planAttempt}/${MAX_PLAN_ATTEMPTS}`,
      );

      if (planAttempt >= MAX_PLAN_ATTEMPTS) {
        console.log(
          `[Orchestrator] Max plan attempts (${MAX_PLAN_ATTEMPTS}) reached - proceeding with current plan`,
        );
        await this.eventCoordinator.emit(logId, 'plan_evaluation_warning', {
          message: `Plan failed evaluation after ${MAX_PLAN_ATTEMPTS} attempts - proceeding anyway`,
          finalScores: evaluationResult.scores,
          passed: false,
        });
        break;
      }

      const lastAttempt =
        evaluationResult.attempts[evaluationResult.attempts.length - 1];
      const feedback = this.extractEvaluationFeedback(
        evaluationResult,
        lastAttempt,
        planAttempt,
      );

      console.log(
        `[Orchestrator] Regenerating plan with feedback: ${feedback.critique.substring(0, 100)}...`,
      );

      await this.eventCoordinator.emit(logId, 'plan_regeneration_started', {
        attemptNumber: planAttempt + 1,
        previousScores: evaluationResult.scores,
        failingDimensions: feedback.failingDimensions,
        critique: feedback.critique,
      });

      plan = await this.plannerService.regeneratePlanWithFeedback(
        query,
        logId,
        feedback,
      );

      planAttempt++;
      console.log(
        `[Orchestrator] Plan regenerated (attempt ${planAttempt}), re-evaluating...`,
      );
    }

    console.log(
      `[Orchestrator] Plan finalized after ${planAttempt} attempt(s), entering execution loop...`,
    );

    // Emit plan created event
    await this.emitPlanCreated(logId, plan);

    // Execute plan and collect results
    const { finalOutput, sources, confidence } = await this.executePlan(
      plan,
      logId,
      phaseMetrics,
    );

    // Answer evaluation
    try {
      await this.evaluationCoordinator.evaluateAnswer(
        logId,
        plan.query,
        finalOutput,
        sources,
      );
    } catch (error) {
      console.error('[Orchestrator] Answer evaluation failed:', error);
    }

    // Completion
    const totalExecutionTime = Date.now() - startTime;

    await this.eventCoordinator.emit(logId, 'session_completed', {
      planId: plan.id,
      totalExecutionTime,
      phaseCount: plan.phases.length,
    });

    return {
      logId,
      planId: plan.id,
      answer: finalOutput,
      sources,
      metadata: {
        totalExecutionTime,
        phases: phaseMetrics,
      },
      confidence,
    };
  }

  /**
   * Execute a decomposed query by running sub-queries according to the execution plan.
   */
  private async executeDecomposedQuery(
    decomposition: DecompositionResult,
    logId: string,
    startTime: number,
  ): Promise<ResearchResult> {
    const subQueryResults = new Map<string, SubQueryResult>();
    const allSources: Array<{ url: string; title: string; relevance: string }> = [];
    const phaseMetrics: Array<{ phase: string; executionTime: number }> = [];

    console.log(`[Orchestrator] Executing ${decomposition.executionPlan.length} phases of sub-queries`);

    // Execute each phase of sub-queries
    for (let phaseIndex = 0; phaseIndex < decomposition.executionPlan.length; phaseIndex++) {
      const phase = decomposition.executionPlan[phaseIndex];
      const phaseStartTime = Date.now();

      console.log(`[Orchestrator] Executing phase ${phaseIndex + 1} with ${phase.length} sub-queries in parallel`);

      // Execute all sub-queries in this phase in parallel
      await Promise.all(
        phase.map(async (subQuery) => {
          // Gather dependency results for context
          const dependencyResults = subQuery.dependencies
            .map(depId => subQueryResults.get(depId))
            .filter((r): r is SubQueryResult => r !== undefined);

          // Execute sub-query
          const result = await this.executeSubQuery(
            subQuery,
            dependencyResults,
            logId,
          );

          subQueryResults.set(subQuery.id, result);
          allSources.push(...result.sources);
        })
      );

      phaseMetrics.push({
        phase: `sub-query-phase-${phaseIndex + 1}`,
        executionTime: Date.now() - phaseStartTime,
      });
    }

    // Synthesize final answer from all sub-query results
    const synthesisStartTime = Date.now();
    const finalAnswer = await this.synthesizeFinalAnswer(
      decomposition.originalQuery,
      decomposition.subQueries,
      subQueryResults,
      logId,
    );

    phaseMetrics.push({
      phase: 'final-synthesis',
      executionTime: Date.now() - synthesisStartTime,
    });

    // Completion
    const totalExecutionTime = Date.now() - startTime;

    await this.eventCoordinator.emit(logId, 'session_completed', {
      totalExecutionTime,
      subQueryCount: decomposition.subQueries.length,
      isDecomposed: true,
    });

    // Deduplicate sources
    const uniqueSources = this.deduplicateSources(allSources);

    return {
      logId,
      planId: `decomposed-${logId}`,
      answer: finalAnswer,
      sources: uniqueSources,
      metadata: {
        totalExecutionTime,
        phases: phaseMetrics,
        subQueryResults,
      },
    };
  }

  /**
   * Execute a single sub-query with dependency context.
   */
  private async executeSubQuery(
    subQuery: SubQuery,
    dependencyResults: SubQueryResult[],
    logId: string,
  ): Promise<SubQueryResult> {
    const subLogId = `${logId}-${subQuery.id}`;

    await this.eventCoordinator.emit(logId, 'sub_query_execution_started', {
      subQueryId: subQuery.id,
      subQueryText: subQuery.text,
      dependencies: subQuery.dependencies,
      type: subQuery.type,
    });

    try {
      // Build query with dependency context if applicable
      let enrichedQuery = subQuery.text;
      if (dependencyResults.length > 0) {
        const contextSummary = dependencyResults
          .map(r => `Previous finding: ${r.answer.substring(0, 500)}`)
          .join('\n\n');
        enrichedQuery = `${subQuery.text}\n\nContext from previous research:\n${contextSummary}`;
      }

      // Execute a simplified research flow for the sub-query
      // Initialize working memory for sub-query
      this.workingMemory.initialize(subLogId, enrichedQuery);

      try {
        // Create plan for sub-query (with reduced complexity)
        const plan = await this.plannerService.createPlan(enrichedQuery, subLogId);

        // Execute plan
        const phaseMetrics: Array<{ phase: string; executionTime: number }> = [];
        const { finalOutput, sources, confidence } = await this.executePlan(
          plan,
          subLogId,
          phaseMetrics,
        );

        const result: SubQueryResult = {
          subQueryId: subQuery.id,
          answer: finalOutput,
          sources,
          confidence: confidence?.overallConfidence,
        };

        await this.eventCoordinator.emit(logId, 'sub_query_execution_completed', {
          subQueryId: subQuery.id,
          success: true,
          answerLength: finalOutput.length,
          sourceCount: sources.length,
        });

        return result;
      } finally {
        this.workingMemory.cleanup(subLogId);
      }
    } catch (error) {
      console.error(`[Orchestrator] Sub-query ${subQuery.id} failed:`, error);

      await this.eventCoordinator.emit(logId, 'sub_query_execution_completed', {
        subQueryId: subQuery.id,
        success: false,
        error: error.message,
      });

      // Return partial result on failure
      return {
        subQueryId: subQuery.id,
        answer: `Failed to answer: ${subQuery.text}. Error: ${error.message}`,
        sources: [],
      };
    }
  }

  /**
   * Synthesize a final answer from all sub-query results.
   */
  private async synthesizeFinalAnswer(
    originalQuery: string,
    subQueries: SubQuery[],
    subQueryResults: Map<string, SubQueryResult>,
    logId: string,
  ): Promise<string> {
    await this.eventCoordinator.emit(logId, 'final_synthesis_started', {
      subQueryCount: subQueries.length,
    });

    // Build context from all sub-query results
    const subQueryContext = subQueries
      .map((sq) => {
        const result = subQueryResults.get(sq.id);
        if (!result) return null;
        return `## Sub-question: ${sq.text}\n### Answer:\n${result.answer}`;
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    const prompt = `You are synthesizing research findings into a comprehensive final answer.

ORIGINAL QUESTION: "${originalQuery}"

RESEARCH FINDINGS FROM SUB-QUESTIONS:
${subQueryContext}

TASK:
Create a comprehensive, well-structured answer that:
1. Directly addresses the original question
2. Integrates insights from all sub-questions
3. Maintains logical flow and coherence
4. Highlights key findings and their relationships
5. Notes any contradictions or gaps in the findings

Write a thorough, professional response that fully answers the original question.`;

    try {
      const response = await this.llmService.chat([
        {
          role: 'system',
          content: 'You are an expert research synthesizer. Create comprehensive, well-structured answers that integrate multiple research findings.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const finalAnswer = response.message.content.trim();

      await this.eventCoordinator.emit(logId, 'final_synthesis_completed', {
        answerLength: finalAnswer.length,
        subQueryCount: subQueries.length,
      });

      return finalAnswer;
    } catch (error) {
      console.error('[Orchestrator] Final synthesis failed:', error);

      // Fallback: concatenate sub-query answers
      const fallbackAnswer = subQueries
        .map((sq) => {
          const result = subQueryResults.get(sq.id);
          return result ? `**${sq.text}**\n${result.answer}` : null;
        })
        .filter(Boolean)
        .join('\n\n');

      await this.eventCoordinator.emit(logId, 'final_synthesis_completed', {
        answerLength: fallbackAnswer.length,
        subQueryCount: subQueries.length,
        usedFallback: true,
      });

      return fallbackAnswer;
    }
  }

  /**
   * Execute a plan and return results.
   */
  private async executePlan(
    plan: Plan,
    logId: string,
    phaseMetrics: Array<{ phase: string; executionTime: number }>,
  ): Promise<{
    finalOutput: string;
    sources: Array<{ url: string; title: string; relevance: string }>;
    confidence?: ConfidenceResult;
  }> {
    let finalOutput = '';
    const sources: Array<{ url: string; title: string; relevance: string }> = [];
    const allStepResults: StepResult[] = [];
    let retrievalEvaluationComplete = false;
    let confidence: ConfidenceResult | undefined;

    console.log(
      `[Orchestrator] Starting execution loop for ${plan.phases.length} phases`,
    );

    // Set up listener for confidence scoring completion
    const confidenceListener = (entry: any) => {
      if (entry.logId === logId && entry.eventType === 'confidence_scoring_completed') {
        confidence = entry.data.confidence;
      }
    };
    this.eventEmitter.on(`log.${logId}`, confidenceListener);

    try {
      // Execute each phase
      for (const phase of plan.phases) {
        console.log(
          `[Orchestrator] Processing phase: ${phase.name} (status: ${phase.status})`,
        );
        if (phase.status === 'skipped') continue;

        // Update working memory with current phase
        this.workingMemory.updatePhase(logId, phase.name, phase.order);

        const phaseStartTime = Date.now();

        // Get appropriate executor for this phase
        const executor = this.phaseExecutorRegistry.getExecutor(phase);
        const phaseResult = await executor.execute(phase, {
          logId,
          plan,
          allPreviousResults: allStepResults,
        });

        phaseMetrics.push({
          phase: phase.name,
          executionTime: Date.now() - phaseStartTime,
        });

        // Accumulate step results across all phases
        allStepResults.push(...phaseResult.stepResults);

        // Store phase results for potential re-planning
        this.plannerService.setPhaseResults(phase.id, phaseResult);

        // Extract sources and final output
        const { sources: phaseSources, output: phaseOutput } =
          this.resultExtractor.extractAllResults(phaseResult);
        sources.push(...phaseSources);
        if (phaseOutput) {
          finalOutput = phaseOutput;
        }

        // Add gathered information to working memory
        for (const source of phaseSources) {
          this.workingMemory.addGatheredInfo(logId, {
            content: source.title || source.url,
            source: source.url,
            relevance: 0.8,
          });
        }

        // Track step results as gathered information
        for (const stepResult of phaseResult.stepResults) {
          if (
            stepResult.status === 'completed' &&
            stepResult.output &&
            typeof stepResult.output === 'string'
          ) {
            if (stepResult.output.trim().length > 0) {
              this.workingMemory.addGatheredInfo(logId, {
                content:
                  stepResult.output.substring(0, 200) +
                  (stepResult.output.length > 200 ? '...' : ''),
                source: `Phase: ${phase.name}, Step: ${stepResult.stepId}`,
                relevance: 0.9,
              });
            }
          }
        }

        // RETRIEVAL EVALUATION - after retrieval phases (search/fetch)
        if (!retrievalEvaluationComplete && this.isRetrievalPhase(phase)) {
          const hasRetrievedContent = allStepResults.some(
            (r) => Array.isArray(r.output) && r.output.length > 0,
          );

          if (hasRetrievedContent) {
            try {
              await this.evaluationCoordinator.evaluateRetrieval(
                logId,
                plan.query,
                allStepResults,
              );
              retrievalEvaluationComplete = true;
            } catch (error) {
              console.error(
                '[Orchestrator] Retrieval evaluation failed:',
                error,
              );
            }
          }
        }

        // RE-PLAN CHECKPOINT
        if (phase.replanCheckpoint && phaseResult.status === 'completed') {
          const stepsBeforeReplan = phase.steps.length;
          const { modified } = await this.plannerService.replan(
            plan,
            phase,
            phaseResult,
            logId,
          );
          if (modified) {
            const stepsAfterReplan = phase.steps.length;
            if (stepsAfterReplan > stepsBeforeReplan) {
              const replanExecutor =
                this.phaseExecutorRegistry.getExecutor(phase);
              const replanResult = await replanExecutor.execute(phase, {
                logId,
                plan,
                allPreviousResults: allStepResults,
              });

              phaseResult.stepResults.push(...replanResult.stepResults);
              phaseResult.status = replanResult.status;
              if (replanResult.error) {
                phaseResult.error = replanResult.error;
              }

              if (replanResult.status !== 'failed') {
                this.plannerService.setPhaseResults(phase.id, phaseResult);

                const { sources: phaseSources, output: phaseOutput } =
                  this.resultExtractor.extractAllResults(phaseResult);
                sources.push(...phaseSources);
                if (phaseOutput) {
                  finalOutput = phaseOutput;
                }
              }
            }
          }
        }

        // FAILURE HANDLING
        if (phaseResult.status === 'failed') {
          const failedStep = phaseResult.stepResults.find(
            (r) => r.status === 'failed',
          );
          if (failedStep) {
            this.workingMemory.addGap(logId, {
              description: `Failed to execute step ${failedStep.stepId} in phase ${phase.name}`,
              severity: 'critical',
              suggestedAction:
                failedStep.error?.message ||
                'Review error details and retry or adjust plan',
            });
          }

          const recovery = await this.handleFailure(
            plan,
            phase,
            phaseResult,
            logId,
          );
          if (recovery.action === 'abort') {
            await this.eventCoordinator.emit(logId, 'session_failed', {
              reason: recovery.reason,
            });
            throw new Error(`Research failed: ${recovery.reason}`);
          }
        }

        // Check for missing information gaps after retrieval phases
        if (this.isRetrievalPhase(phase)) {
          const hasResults = phaseResult.stepResults.some(
            (r) =>
              r.status === 'completed' &&
              r.output &&
              (Array.isArray(r.output) ? r.output.length > 0 : true),
          );
          if (!hasResults) {
            this.workingMemory.addGap(logId, {
              description: `No results retrieved in phase: ${phase.name}`,
              severity: 'important',
              suggestedAction:
                'Try alternative search queries or different data sources',
            });
          }
        }
      }
    } finally {
      // Remove confidence listener
      this.eventEmitter.off(`log.${logId}`, confidenceListener);
    }

    return { finalOutput, sources, confidence };
  }

  /**
   * Add sub-goals to working memory based on query analysis.
   */
  private addQuerySubGoals(query: string, logId: string): void {
    const queryLower = query.toLowerCase();
    const aspects: Array<{ description: string; priority: number }> = [];

    if (
      queryLower.includes('compare') ||
      queryLower.includes('difference') ||
      queryLower.includes('vs')
    ) {
      aspects.push({
        description: 'Compare multiple entities or concepts',
        priority: 1.0,
      });
    }
    if (
      queryLower.includes('how') ||
      queryLower.includes('explain') ||
      queryLower.includes('what is')
    ) {
      aspects.push({
        description: 'Provide detailed explanation',
        priority: 1.0,
      });
    }
    if (
      queryLower.includes('when') ||
      queryLower.includes('date') ||
      queryLower.includes('year')
    ) {
      aspects.push({
        description: 'Identify temporal information',
        priority: 0.7,
      });
    }
    if (queryLower.includes('why') || queryLower.includes('reason')) {
      aspects.push({
        description: 'Determine causality or reasoning',
        priority: 1.0,
      });
    }
    if (queryLower.includes('where') || queryLower.includes('location')) {
      aspects.push({
        description: 'Identify location or place',
        priority: 0.7,
      });
    }

    if (aspects.length === 0) {
      aspects.push({
        description: 'Find comprehensive answer to query',
        priority: 1.0,
      });
    }

    for (const aspect of aspects) {
      this.workingMemory.addSubGoal(logId, {
        description: aspect.description,
        status: 'pending',
        priority: aspect.priority,
        dependencies: [],
      });
    }
  }

  /**
   * Emit plan created event with full plan details.
   */
  private async emitPlanCreated(logId: string, plan: Plan): Promise<void> {
    await this.eventCoordinator.emit(logId, 'plan_created', {
      planId: plan.id,
      query: plan.query,
      status: plan.status,
      totalPhases: plan.phases.length,
      createdAt: plan.createdAt,
      phases: plan.phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
        description: phase.description,
        status: phase.status,
        order: phase.order,
        replanCheckpoint: phase.replanCheckpoint,
        totalSteps: phase.steps.length,
        steps: phase.steps.map((step) => ({
          id: step.id,
          toolName: step.toolName,
          type: step.type,
          config: step.config,
          dependencies: step.dependencies,
          status: step.status,
          order: step.order,
        })),
      })),
    });
  }

  /**
   * Deduplicate sources by URL.
   */
  private deduplicateSources(
    sources: Array<{ url: string; title: string; relevance: string }>,
  ): Array<{ url: string; title: string; relevance: string }> {
    const seen = new Set<string>();
    return sources.filter((source) => {
      if (seen.has(source.url)) {
        return false;
      }
      seen.add(source.url);
      return true;
    });
  }

  private async handleFailure(
    plan: Plan,
    phase: Phase,
    phaseResult: PhaseResult,
    logId: string,
  ): Promise<RecoveryDecision> {
    const failedStep = phaseResult.stepResults.find(
      (r) => r.status === 'failed',
    );

    const failureContext: FailureContext = {
      planSummary: JSON.stringify({
        planId: plan.id,
        query: plan.query,
        phases: plan.phases.map((p) => ({ name: p.name, status: p.status })),
      }),
      failedPhase: phase.name,
      failedStep: failedStep
        ? {
            stepId: failedStep.stepId,
            toolName:
              phase.steps.find((s) => s.id === failedStep.stepId)?.toolName ||
              'unknown',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            config: failedStep.input,
            error: {
              message: failedStep.error?.message || 'Unknown error',
              stack: failedStep.error?.stack,
            },
          }
        : undefined,
      completedSteps: phaseResult.stepResults
        .filter((r) => r.status === 'completed')
        .map((r) => r.stepId),
      remainingPhases: plan.phases
        .filter((p) => p.status === 'pending')
        .map((p) => p.name),
    };

    return this.plannerService.decideRecovery(failureContext, logId);
  }

  private async emit(
    logId: string,
    eventType: LogEventType,
    data: Record<string, unknown>,
    phaseId?: string,
    stepId?: string,
  ): Promise<void> {
    const entry = await this.logService.append({
      logId,
      eventType,
      timestamp: new Date(),
      phaseId,
      stepId,
      data,
    });

    console.log(`[Orchestrator] Emitting event: log.${logId} - ${eventType}`);
    this.eventEmitter.emit(`log.${logId}`, entry);
    this.eventEmitter.emit('log.all', entry);
  }

  /**
   * Check if a phase is a retrieval phase (search/fetch)
   */
  private isRetrievalPhase(phase: Phase): boolean {
    const phaseName = phase.name.toLowerCase();
    return (
      phaseName.includes('search') ||
      phaseName.includes('fetch') ||
      phaseName.includes('gather') ||
      phaseName.includes('retriev')
    );
  }

  /**
   * Extract structured feedback from evaluation result for plan regeneration.
   */
  private extractEvaluationFeedback(
    evaluationResult: {
      passed: boolean;
      scores: Record<string, number>;
      attempts: Array<{
        evaluatorResults: Array<{
          role: string;
          critique: string;
          explanation?: string;
        }>;
        iterationDecision?: {
          specificIssues: Array<{ issue: string; fix: string }>;
          feedbackToPlanner: string;
        };
      }>;
    },
    lastAttempt:
      | {
          evaluatorResults: Array<{
            role: string;
            critique: string;
            explanation?: string;
          }>;
          iterationDecision?: {
            specificIssues: Array<{ issue: string; fix: string }>;
            feedbackToPlanner: string;
          };
        }
      | undefined,
    attemptNumber: number,
  ): {
    critique: string;
    specificIssues: Array<{ issue: string; fix: string }>;
    failingDimensions: string[];
    scores: Record<string, number>;
    attemptNumber: number;
  } {
    const PASS_THRESHOLD = 0.6;
    const failingDimensions = Object.entries(evaluationResult.scores)
      .filter(([_, score]) => score < PASS_THRESHOLD)
      .map(([dim, _]) => dim);

    let critique = '';
    const specificIssues: Array<{ issue: string; fix: string }> = [];

    if (lastAttempt) {
      const critiques = lastAttempt.evaluatorResults
        .filter((r) => r.critique && r.critique.trim() !== '')
        .map((r) => `[${r.role}]: ${r.critique}`);

      critique = critiques.join('\n\n');

      if (lastAttempt.iterationDecision) {
        if (lastAttempt.iterationDecision.feedbackToPlanner) {
          critique =
            lastAttempt.iterationDecision.feedbackToPlanner + '\n\n' + critique;
        }
        if (lastAttempt.iterationDecision.specificIssues) {
          specificIssues.push(...lastAttempt.iterationDecision.specificIssues);
        }
      }
    }

    if (!critique || critique.trim() === '') {
      critique = `The plan failed evaluation. Failing dimensions: ${failingDimensions.join(', ')}. Please ensure the search queries directly address the user's question and use appropriate language/dates.`;
    }

    if (failingDimensions.includes('queryCoverage')) {
      specificIssues.push({
        issue: 'Search queries do not cover the key aspects of the user query',
        fix: 'Ensure all search queries directly relate to what the user is asking about',
      });
    }
    if (failingDimensions.includes('queryAccuracy')) {
      specificIssues.push({
        issue: 'Search queries do not accurately reflect the user intent',
        fix: 'Match the language and topic of the user query exactly',
      });
    }

    return {
      critique,
      specificIssues,
      failingDimensions,
      scores: evaluationResult.scores,
      attemptNumber,
    };
  }
}
