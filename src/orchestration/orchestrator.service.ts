// src/orchestration/orchestrator.service.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PlannerService } from './planner.service';
import { ExecutorRegistry } from '../executors/executor-registry.service';
import { LogService } from '../logging/log.service';
import { Plan } from './interfaces/plan.interface';
import { Phase, PhaseResult, StepResult } from './interfaces/phase.interface';
import { PlanStep } from './interfaces/plan-step.interface';
import { LogEventType } from '../logging/interfaces/log-event-type.enum';
import {
  FailureContext,
  RecoveryDecision,
} from './interfaces/recovery.interface';
import {
  getMilestoneTemplates,
  formatMilestoneDescription,
} from '../logging/milestone-templates';
import { PlanEvaluationOrchestratorService } from '../evaluation/services/plan-evaluation-orchestrator.service';

export interface ResearchResult {
  logId: string;
  planId: string;
  answer: string;
  sources: Array<{ url: string; title: string; relevance: string }>;
  metadata: {
    totalExecutionTime: number;
    phases: Array<{ phase: string; executionTime: number }>;
  };
}

@Injectable()
export class Orchestrator {
  constructor(
    private plannerService: PlannerService,
    private executorRegistry: ExecutorRegistry,
    private logService: LogService,
    private eventEmitter: EventEmitter2,
    private planEvaluationOrchestrator: PlanEvaluationOrchestratorService,
  ) {}

  async executeResearch(query: string, logId?: string): Promise<ResearchResult> {
    logId = logId || randomUUID();
    const startTime = Date.now();
    const phaseMetrics: Array<{ phase: string; executionTime: number }> = [];

    // 1. PLANNING PHASE
    await this.emit(logId, 'session_started', { query });

    const plan = await this.plannerService.createPlan(query, logId);

    console.log(`[Orchestrator] Plan created with ${plan.phases.length} phases, entering execution loop...`);

    // PLAN EVALUATION
    console.log('[Orchestrator] Starting plan evaluation...');
    await this.emit(logId, 'evaluation_started', {
      phase: 'plan',
      query: plan.query
    });
    console.log('[Orchestrator] evaluation_started event emitted');

    console.log('[Orchestrator] Calling planEvaluationOrchestrator.evaluatePlan...');
    const evaluationResult = await this.planEvaluationOrchestrator.evaluatePlan({
      query: plan.query,
      plan: {
        id: plan.id,
        phases: plan.phases,
        searchQueries: this.extractSearchQueries(plan),
      },
    });
    console.log('[Orchestrator] Plan evaluation completed:', JSON.stringify(evaluationResult, null, 2));

    await this.emit(logId, 'evaluation_completed', {
      phase: 'plan',
      passed: evaluationResult.passed,
      scores: evaluationResult.scores,
      confidence: evaluationResult.confidence,
      totalIterations: evaluationResult.totalIterations,
      escalatedToLargeModel: evaluationResult.escalatedToLargeModel,
      evaluationSkipped: evaluationResult.evaluationSkipped,
      skipReason: evaluationResult.skipReason,
    });

    // Log evaluation result for user visibility
    if (!evaluationResult.evaluationSkipped) {
      const scoresSummary = Object.entries(evaluationResult.scores)
        .map(([dim, score]) => `${dim}: ${((score as number) * 100).toFixed(0)}%`)
        .join(', ');

      console.log(`[Orchestrator] Plan evaluation: ${evaluationResult.passed ? 'PASSED' : 'FAILED'} (${scoresSummary})`);
    }

    // Log the FULL plan with all phases and steps
    await this.emit(logId, 'plan_created', {
      planId: plan.id,
      query: plan.query,
      status: plan.status,
      totalPhases: plan.phases.length,
      createdAt: plan.createdAt,
      // Full plan structure with all details
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

    let finalOutput = '';
    const sources: Array<{ url: string; title: string; relevance: string }> =
      [];
    const allStepResults: StepResult[] = [];

    console.log(`[Orchestrator] Starting execution loop for ${plan.phases.length} phases`);

    // 2. EXECUTION LOOP
    for (const phase of plan.phases) {
      console.log(`[Orchestrator] Processing phase: ${phase.name} (status: ${phase.status})`);
      if (phase.status === 'skipped') continue;

      const phaseStartTime = Date.now();
      const phaseResult = await this.executePhase(phase, plan, logId, allStepResults);

      phaseMetrics.push({
        phase: phase.name,
        executionTime: Date.now() - phaseStartTime,
      });

      // Accumulate step results across all phases
      allStepResults.push(...phaseResult.stepResults);

      // Store phase results for potential re-planning
      this.plannerService.setPhaseResults(phase.id, phaseResult);

      // Extract sources and final output
      this.extractResultData(phaseResult, sources, (output) => {
        finalOutput = output;
      });

      // 3. RE-PLAN CHECKPOINT
      if (phase.replanCheckpoint && phaseResult.status === 'completed') {
        const stepsBeforeReplan = phase.steps.length;
        const { modified } = await this.plannerService.replan(
          plan,
          phase,
          phaseResult,
          logId,
        );
        if (modified) {
          // Check if steps were added to the current phase during replanning
          const stepsAfterReplan = phase.steps.length;
          if (stepsAfterReplan > stepsBeforeReplan) {
            // Re-execute the phase with the new steps
            await this.emit(logId, 'phase_started', {
              phaseId: phase.id,
              phaseName: phase.name,
              stepCount: phase.steps.length,
              reason: 'replan_added_steps',
            }, phase.id);

            // Execute only the new steps (those with pending status)
            const newSteps = phase.steps.filter(s => s.status === 'pending');
            const stepQueue = this.buildExecutionQueue(newSteps);

            for (const stepBatch of stepQueue) {
              const batchResults = await Promise.all(
                stepBatch.map((step) => this.executeStep(step, logId, plan, phaseResult.stepResults)),
              );
              phaseResult.stepResults.push(...batchResults);

              const failed = batchResults.find((r) => r.status === 'failed');
              if (failed) {
                phase.status = 'failed';
                await this.emit(logId, 'phase_failed', {
                  phaseId: phase.id,
                  phaseName: phase.name,
                  failedStepId: failed.stepId,
                  error: failed.error?.message,
                }, phase.id);
                phaseResult.status = 'failed';
                phaseResult.error = failed.error;
                break;
              }
            }

            if (phaseResult.status !== 'failed') {
              await this.emit(logId, 'phase_completed', {
                phaseId: phase.id,
                phaseName: phase.name,
                stepsCompleted: phaseResult.stepResults.length,
                reason: 'replan_execution',
              }, phase.id);

              // Update phase results for re-planning
              this.plannerService.setPhaseResults(phase.id, phaseResult);

              // Re-extract result data
              this.extractResultData(phaseResult, sources, (output) => {
                finalOutput = output;
              });
            }
          }
        }
      }

      // 4. FAILURE HANDLING
      if (phaseResult.status === 'failed') {
        const recovery = await this.handleFailure(
          plan,
          phase,
          phaseResult,
          logId,
        );
        if (recovery.action === 'abort') {
          await this.emit(logId, 'session_failed', { reason: recovery.reason });
          throw new Error(`Research failed: ${recovery.reason}`);
        }
      }
    }

    // 5. COMPLETION
    const totalExecutionTime = Date.now() - startTime;

    await this.emit(logId, 'session_completed', {
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
    };
  }

  private async executePhase(
    phase: Phase,
    plan: Plan,
    logId: string,
    allPreviousResults: StepResult[] = [],
  ): Promise<PhaseResult> {
    phase.status = 'running';

    await this.emit(
      logId,
      'phase_started',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepCount: phase.steps.length,
      },
      phase.id,
    );

    // Emit milestones for this phase
    await this.emitPhaseMilestones(phase, logId, plan.query);

    const stepResults: StepResult[] = [];
    const stepQueue = this.buildExecutionQueue(phase.steps);

    for (const stepBatch of stepQueue) {
      // Pass all previous results (from previous phases) + current phase results
      const contextResults = [...allPreviousResults, ...stepResults];
      const batchResults = await Promise.all(
        stepBatch.map((step) => this.executeStep(step, logId, plan, contextResults)),
      );
      stepResults.push(...batchResults);

      const failed = batchResults.find((r) => r.status === 'failed');
      if (failed) {
        phase.status = 'failed';
        await this.emit(
          logId,
          'phase_failed',
          {
            phaseId: phase.id,
            phaseName: phase.name,
            failedStepId: failed.stepId,
            error: failed.error?.message,
          },
          phase.id,
        );
        return { status: 'failed', stepResults, error: failed.error };
      }
    }

    phase.status = 'completed';
    await this.emit(
      logId,
      'phase_completed',
      {
        phaseId: phase.id,
        phaseName: phase.name,
        stepsCompleted: stepResults.length,
      },
      phase.id,
    );

    // Emit final milestone for the completed phase
    await this.emitPhaseCompletionMilestone(phase, logId);

    return { status: 'completed', stepResults };
  }

  private async executeStep(
    step: PlanStep,
    logId: string,
    plan?: Plan,
    phaseResults?: StepResult[],
  ): Promise<StepResult> {
    const startTime = Date.now();
    step.status = 'running';

    // Enrich synthesize steps with query and accumulated results
    if (step.toolName === 'synthesize' && plan && phaseResults) {
      this.enrichSynthesizeStep(step, plan, phaseResults);
    }

    // Provide default config for tools if missing
    if (!step.config || Object.keys(step.config).length === 0) {
      step.config = this.getDefaultConfig(step.toolName, plan, phaseResults);
    }

    await this.emit(
      logId,
      'step_started',
      {
        stepId: step.id,
        toolName: step.toolName,
        type: step.type,
        config: step.config,
      },
      step.phaseId,
      step.id,
    );

    try {
      const executor = this.executorRegistry.getExecutor(step.toolName);
      const result = await executor.execute(step, logId);
      const durationMs = Date.now() - startTime;

      step.status = 'completed';

      await this.emit(
        logId,
        'step_completed',
        {
          stepId: step.id,
          toolName: step.toolName,
          input: step.config,
          output: result.output,
          tokensUsed: result.tokensUsed,
          durationMs,
          metadata: result.metadata,
        },
        step.phaseId,
        step.id,
      );

      return {
        status: 'completed',
        stepId: step.id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        output: result.output,
        input: step.config,
        toolName: step.toolName, // Include toolName to identify synthesis steps
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      step.status = 'failed';

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      await this.emit(
        logId,
        'step_failed',
        {
          stepId: step.id,
          toolName: step.toolName,
          input: step.config,
          error: {
            message: errorMessage,
            stack: errorStack,
          },
          durationMs,
        },
        step.phaseId,
        step.id,
      );

      return {
        status: 'failed',
        stepId: step.id,
        error: error as Error,
        input: step.config,
        toolName: step.toolName,
      };
    }
  }

  private buildExecutionQueue(steps: PlanStep[]): PlanStep[][] {
    const queue: PlanStep[][] = [];
    const completed = new Set<string>();
    const remaining = [...steps];

    while (remaining.length > 0) {
      const batch: PlanStep[] = [];

      for (let i = remaining.length - 1; i >= 0; i--) {
        const step = remaining[i];
        const depsComplete = step.dependencies.every((dep) =>
          completed.has(dep),
        );

        if (depsComplete) {
          batch.push(step);
          remaining.splice(i, 1);
        }
      }

      if (batch.length === 0 && remaining.length > 0) {
        // Circular dependency or missing dependency - execute remaining in order
        batch.push(...remaining);
        remaining.length = 0;
      }

      if (batch.length > 0) {
        queue.push(batch);
        batch.forEach((s) => completed.add(s.id));
      }
    }

    return queue;
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

  private extractResultData(
    phaseResult: PhaseResult,
    sources: Array<{ url: string; title: string; relevance: string }>,
    setOutput: (output: string) => void,
  ): void {
    // Track synthesis outputs separately to prioritize them
    let synthesisOutput: string | null = null;
    let genericStringOutput: string | null = null;

    for (const stepResult of phaseResult.stepResults) {
      if (stepResult.output) {
        // Extract sources from search results
        if (Array.isArray(stepResult.output)) {
          for (const item of stepResult.output) {
            if (this.isSearchResultItem(item)) {
              const score = typeof item.score === 'number' ? item.score : 0;
              sources.push({
                url: item.url,
                title: item.title,
                relevance: score > 0.7 ? 'high' : 'medium',
              });
            }
          }
        }

        // Extract final answer - prioritize synthesis steps
        if (typeof stepResult.output === 'string' && stepResult.output.trim().length > 0) {
          // Check if this is a synthesis step (synthesis, synthesize, tavily_synthesize, etc.)
          const isSynthesisStep = stepResult.toolName &&
            (stepResult.toolName.toLowerCase().includes('synth') ||
             stepResult.toolName === 'llm');

          if (isSynthesisStep) {
            // Always prefer synthesis step output
            synthesisOutput = stepResult.output;
          } else if (!synthesisOutput && stepResult.output.length > 50) {
            // Fallback: use longer string outputs if no synthesis found
            genericStringOutput = stepResult.output;
          }
        }
      }
    }

    // Set the output, prioritizing synthesis results
    if (synthesisOutput) {
      setOutput(synthesisOutput);
    } else if (genericStringOutput) {
      setOutput(genericStringOutput);
    }
  }

  private isSearchResultItem(
    item: unknown,
  ): item is { url: string; title: string; score?: number } {
    return (
      typeof item === 'object' &&
      item !== null &&
      'url' in item &&
      'title' in item &&
      typeof (item as Record<string, unknown>).url === 'string' &&
      typeof (item as Record<string, unknown>).title === 'string'
    );
  }

  private getDefaultConfig(
    toolName: string,
    plan?: Plan,
    phaseResults?: StepResult[],
  ): Record<string, unknown> {
    switch (toolName) {
      case 'tavily_search':
        // Default to searching for the main query
        return { query: plan?.query || 'research query', max_results: 5 };

      case 'web_fetch':
        // Try to get URL from previous search results
        if (phaseResults) {
          for (const result of phaseResults) {
            if (Array.isArray(result.output)) {
              for (const item of result.output) {
                if (item && typeof item === 'object' && 'url' in item) {
                  return { url: item.url };
                }
              }
            }
          }
        }
        // Fallback: return empty config (will cause tool to fail gracefully)
        return {};

      default:
        return {};
    }
  }

  private enrichSynthesizeStep(
    step: PlanStep,
    plan: Plan,
    accumulatedResults: StepResult[],
  ): void {
    // Build context from all previous phase results
    const searchResults: unknown[] = [];
    const fetchResults: string[] = [];

    for (const result of accumulatedResults) {
      if (result.status === 'completed' && result.output) {
        // Collect search results (arrays of search result objects)
        if (Array.isArray(result.output)) {
          searchResults.push(...result.output);
        }
        // Collect fetch results (string content)
        else if (typeof result.output === 'string') {
          fetchResults.push(result.output);
        }
      }
    }

    // Build a comprehensive context string
    let contextString = '';

    if (searchResults.length > 0) {
      contextString += '## Search Results\n\n';
      contextString += JSON.stringify(searchResults, null, 2);
      contextString += '\n\n';
    }

    if (fetchResults.length > 0) {
      contextString += '## Fetched Content\n\n';
      contextString += fetchResults.join('\n\n---\n\n');
    }

    // Enrich the step config (with null safety)
    const existingConfig = step.config || {};
    step.config = {
      ...existingConfig,
      query: plan.query,
      context: contextString,
      systemPrompt:
        existingConfig.systemPrompt ||
        'You are a research synthesis assistant. Analyze the provided search results and fetched content to answer the user query comprehensively.',
      prompt:
        existingConfig.prompt ||
        `Based on the research query and gathered information, provide a comprehensive answer.\n\nQuery: ${plan.query}`,
    };
  }

  private extractSearchQueries(plan: Plan): string[] {
    const queries: string[] = [];
    for (const phase of plan.phases) {
      for (const step of phase.steps) {
        if (step.toolName === 'web_search' && step.config?.query) {
          queries.push(step.config.query);
        }
      }
    }
    return queries;
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
   * Detect the stage type from phase name
   */
  private detectPhaseType(phaseName: string): 1 | 2 | 3 | null {
    const name = phaseName.toLowerCase();
    if (name.includes('search') || name.includes('initial') || name.includes('query')) {
      return 1;
    }
    if (name.includes('fetch') || name.includes('content') || name.includes('gather')) {
      return 2;
    }
    if (name.includes('synth') || name.includes('answer') || name.includes('generat')) {
      return 3;
    }
    return null;
  }

  /**
   * Emit milestones for a phase based on its type
   */
  private async emitPhaseMilestones(
    phase: Phase,
    logId: string,
    query: string,
  ): Promise<void> {
    const stageType = this.detectPhaseType(phase.name);
    if (!stageType) {
      console.log(`[Orchestrator] Phase "${phase.name}" does not map to a milestone stage`);
      return;
    }

    const templates = getMilestoneTemplates(stageType);
    console.log(`[Orchestrator] Emitting ${templates.length} milestones for stage ${stageType} (${phase.name})`);

    // Emit initial milestones for the phase
    for (let i = 0; i < templates.length - 1; i++) {
      const template = templates[i];
      const milestoneId = `${phase.id}_${template.id}`;

      // Build template data based on stage and milestone
      const templateData = this.buildMilestoneTemplateData(stageType, template.id, query, phase);
      const description = formatMilestoneDescription(template.template, templateData);

      await this.emit(
        logId,
        'milestone_started',
        {
          milestoneId,
          templateId: template.id,
          stage: stageType,
          description,
          template: template.template,
          templateData,
          progress: template.expectedProgress,
          status: 'running',
        },
        phase.id,
      );

      // Small delay between milestones for visual effect
      await this.delay(100);
    }
  }

  /**
   * Emit the final milestone for a completed phase
   */
  private async emitPhaseCompletionMilestone(
    phase: Phase,
    logId: string,
  ): Promise<void> {
    const stageType = this.detectPhaseType(phase.name);
    if (!stageType) return;

    const templates = getMilestoneTemplates(stageType);
    if (templates.length === 0) return;

    const lastTemplate = templates[templates.length - 1];
    const milestoneId = `${phase.id}_${lastTemplate.id}`;
    const description = formatMilestoneDescription(lastTemplate.template, {});

    await this.emit(
      logId,
      'milestone_completed',
      {
        milestoneId,
        templateId: lastTemplate.id,
        stage: stageType,
        description,
        template: lastTemplate.template,
        templateData: {},
        progress: lastTemplate.expectedProgress,
        status: 'completed',
      },
      phase.id,
    );
  }

  /**
   * Build template data for milestone descriptions
   */
  private buildMilestoneTemplateData(
    stage: 1 | 2 | 3,
    templateId: string,
    query: string,
    phase: Phase,
  ): Record<string, unknown> {
    switch (stage) {
      case 1:
        if (templateId === 'stage1_identify_terms') {
          // Extract key terms from query
          const terms = this.extractKeyTerms(query);
          return { terms: terms.join(', ') };
        }
        if (templateId === 'stage1_search') {
          return {
            count: phase.steps.length,
            sources: 'Tavily (web sources, news, articles)',
          };
        }
        return {};

      case 2:
        if (templateId === 'stage2_fetch') {
          return { count: phase.steps.length };
        }
        if (templateId === 'stage2_extract') {
          return { url: 'source content' };
        }
        return {};

      case 3:
        if (templateId === 'stage3_analyze') {
          return { count: phase.steps.length };
        }
        return {};

      default:
        return {};
    }
  }

  /**
   * Extract key terms from a query string
   */
  private extractKeyTerms(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'can', 'what', 'how', 'why',
      'when', 'where', 'who', 'which', 'this', 'that', 'these', 'those',
      'latest', 'current', 'recent', 'about',
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    const uniqueWords = [...new Set(words)];
    return uniqueWords.sort((a, b) => b.length - a.length).slice(0, 5);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
