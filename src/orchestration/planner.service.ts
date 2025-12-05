// @ts-nocheck
// src/orchestration/planner.service.ts
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { LLMService } from '../llm/llm.service';
import { ToolExecutor } from '../executors/tool.executor';
import { LogService } from '../logging/log.service';
import { ReasoningTraceService } from '../reasoning/services/reasoning-trace.service';
import { Plan } from './interfaces/plan.interface';
import { Phase, PhaseResult } from './interfaces/phase.interface';
import { PlanStep } from './interfaces/plan-step.interface';
import {
  FailureContext,
  RecoveryDecision,
} from './interfaces/recovery.interface';
import { ChatMessage } from '../llm/interfaces/chat-message.interface';
import { planningTools } from './tools/planning-tools';
import { recoveryTools } from './tools/recovery-tools';
import { ToolDefinition } from '../tools/interfaces/tool-definition.interface';
import { analyzeQuery, QueryEnhancementMetadata } from './utils/query-enhancer';

@Injectable()
export class PlannerService {
  private currentPlan: Plan | null = null;
  private phaseResults: Map<string, any> = new Map();
  private finalizeFailureCount: number = 0;
  private planCreationCount: number = 0;

  constructor(
    private llmService: LLMService,
    private toolExecutor: ToolExecutor,
    private logService: LogService,
    private eventEmitter: EventEmitter2,
    private reasoningTrace: ReasoningTraceService,
  ) {}

  async createPlan(query: string, logId: string): Promise<Plan> {
    console.log(`[PlannerService] createPlan: Starting - ${JSON.stringify({ query, logId })}`);

    this.currentPlan = null;
    this.phaseResults.clear();
    this.finalizeFailureCount = 0;
    this.planCreationCount = 0;

    // Emit initial thought about analyzing the query
    console.log(`[PlannerService] createPlan: Before emitThought #1`);
    await this.reasoningTrace.emitThought(
      logId,
      `Analyzing research query: "${query}". Identifying key concepts and information needs.`,
      { stage: 'planning', step: 1 },
    );
    console.log(`[PlannerService] createPlan: After emitThought #1`);

    console.log(`[PlannerService] createPlan: Getting available tools`);
    const availableTools = this.toolExecutor.getAvailableTools();
    console.log(`[PlannerService] createPlan: Got ${availableTools.length} available tools`);

    console.log(`[PlannerService] createPlan: Building planner system prompt`);
    const systemPrompt = this.buildPlannerSystemPrompt(availableTools);
    console.log(`[PlannerService] createPlan: System prompt built (length: ${systemPrompt.length})`);

    // Emit thought about available tools and planning strategy
    console.log(`[PlannerService] createPlan: Before emitThought #2`);
    const planningThoughtId = await this.reasoningTrace.emitThought(
      logId,
      `Planning strategy: Will use LLM to generate multi-phase research plan. Available tools: ${availableTools.map((t) => t.function.name).join(', ')}. Assessing query complexity to determine optimal approach.`,
      { stage: 'planning', step: 2 },
    );
    console.log(`[PlannerService] createPlan: After emitThought #2 - thoughtId: ${planningThoughtId}`);

    // Emit planning_started event so UI shows "Planning..." indicator
    console.log(`[PlannerService] createPlan: Before logService.append (planning_started)`);
    const planningStartEntry = await this.logService.append({
      logId,
      eventType: 'planning_started',
      timestamp: new Date(),
      data: {
        query,
        availableTools: availableTools.map((t) => t.function.name),
        message: 'LLM is generating research plan...',
      },
    });
    console.log(`[PlannerService] createPlan: After logService.append - entry: ${JSON.stringify({ id: planningStartEntry.id, eventType: planningStartEntry.eventType })}`);

    console.log(`[PlannerService] createPlan: Before eventEmitter.emit`);
    this.eventEmitter.emit(`log.${logId}`, planningStartEntry);
    console.log(`[PlannerService] createPlan: After eventEmitter.emit`);

    console.log(`[PlannerService] createPlan: Building chat messages`);
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildPlanningPrompt(query) },
    ];
    console.log(`[PlannerService] createPlan: Chat messages built - ${messages.length} messages`);

    let planningComplete = false;
    const maxIterations = 20;
    let iteration = 0;

    console.log(`[PlannerService] createPlan: Entering planning loop (max ${maxIterations} iterations)`);
    while (!planningComplete && iteration < maxIterations) {
      iteration++;
      console.log(`[PlannerService] createPlan: === Iteration ${iteration}/${maxIterations} ===`);

      // Log each planning iteration
      console.log(`[PlannerService] createPlan: Before logService.append (planning_iteration)`);
      const iterationEntry = await this.logService.append({
        logId,
        eventType: 'planning_iteration',
        timestamp: new Date(),
        data: {
          iteration,
          maxIterations,
          message: `Planning iteration ${iteration}/${maxIterations}`,
        },
      });
      console.log(`[PlannerService] createPlan: After logService.append (planning_iteration)`);

      console.log(`[PlannerService] createPlan: Emitting iteration entry`);
      this.eventEmitter.emit(`log.${logId}`, iterationEntry);
      console.log(`[PlannerService] createPlan: Iteration entry emitted`);

      console.log(`[PlannerService] createPlan: Before llmService.chat (iteration ${iteration})`);
      const response = await this.llmService.chat(messages, planningTools);
      console.log(`[PlannerService] createPlan: After llmService.chat - response: ${JSON.stringify({ hasMessage: !!response.message, hasToolCalls: !!response.message?.tool_calls?.length })}`);

      if (response.message.tool_calls?.length > 0) {
        console.log(`[PlannerService] createPlan: Processing ${response.message.tool_calls.length} tool calls`);

        // Push assistant message ONCE before processing tool calls (Azure OpenAI requirement)
        messages.push(response.message);

        // Process all tool calls and push their results
        for (const toolCall of response.message.tool_calls) {
          console.log(`[PlannerService] createPlan: Before executePlanningTool - tool: ${toolCall.function.name}`);
          const result = await this.executePlanningTool(toolCall, logId);
          console.log(`[PlannerService] createPlan: After executePlanningTool - result: ${JSON.stringify({ hasError: !!result.error })}`);

          if (toolCall.function.name === 'finalize_plan') {
            // Only mark as complete if finalize_plan succeeded (no error)
            if (!result.error) {
              console.log(`[PlannerService] createPlan: finalize_plan succeeded - marking planning complete`);
              planningComplete = true;
            } else {
              console.log(`[PlannerService] createPlan: finalize_plan failed - error: ${result.error}`);
            }
          }

          console.log(`[PlannerService] createPlan: Pushing tool result to chat history`);
          messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: (toolCall as any).id } as any);
          console.log(`[PlannerService] createPlan: Tool result pushed - total messages: ${messages.length}`);
        }
      } else {
        console.log(`[PlannerService] createPlan: No tool calls - prompting to continue`);
        messages.push(response.message);
        messages.push({
          role: 'user',
          content:
            'Continue building the plan or call finalize_plan when complete.',
        });
        console.log(`[PlannerService] createPlan: Continue messages pushed - total messages: ${messages.length}`);
      }
    }
    console.log(`[PlannerService] createPlan: Exited planning loop - planningComplete: ${planningComplete}, iterations: ${iteration}`);

    if (!this.currentPlan) {
      throw new Error('Planning failed: no plan created');
    }

    // Emit observation about plan generation completion
    console.log(`[PlannerService] createPlan: Calculating plan stats`);
    const totalSteps = this.currentPlan.phases.reduce(
      (sum, p) => sum + p.steps.length,
      0,
    );
    console.log(`[PlannerService] createPlan: Plan stats - phases: ${this.currentPlan.phases.length}, totalSteps: ${totalSteps}`);

    console.log(`[PlannerService] createPlan: Before emitObservation`);
    await this.reasoningTrace.emitObservation(
      logId,
      planningThoughtId,
      `Generated plan with ${this.currentPlan.phases.length} phases and ${totalSteps} total steps.`,
      `Plan structure created successfully. Now validating completeness and adding any missing components.`,
      [
        'Plan phases defined',
        'Steps allocated to phases',
        'Validation needed for completeness',
      ],
    );
    console.log(`[PlannerService] createPlan: After emitObservation`);

    // Auto-recovery: If any phases are empty, add default steps automatically
    const emptyPhases = this.currentPlan.phases.filter(
      (p) => p.steps.length === 0,
    );
    if (emptyPhases.length > 0) {
      console.log(
        `[PlannerService] Auto-recovering ${emptyPhases.length} empty phases by adding default steps`,
      );

      // Log the auto-recovery action
      await this.logService.append({
        logId,
        eventType: 'auto_recovery',
        timestamp: new Date(),
        planId: this.currentPlan.id,
        data: {
          reason:
            'LLM created phases without steps - auto-adding default steps',
          emptyPhaseCount: emptyPhases.length,
          emptyPhaseNames: emptyPhases.map((p) => p.name),
        },
      });

      // Auto-add default steps to all empty phases
      for (const phase of emptyPhases) {
        this.autoAddDefaultSteps(phase, logId);
      }
    }

    // CRITICAL VALIDATION: Ensure plan has a synthesis/answer generation phase
    console.log(`[PlannerService] createPlan: Before ensureSynthesisPhase`);
    try {
      await this.ensureSynthesisPhase(this.currentPlan, logId);
      console.log(`[PlannerService] createPlan: After ensureSynthesisPhase - success`);
    } catch (error) {
      console.error(`[PlannerService] createPlan: ensureSynthesisPhase FAILED - ${error.message}`, error.stack);
      throw error;
    }

    // Emit final conclusion about completed plan
    console.log(`[PlannerService] createPlan: Before final conclusion`);
    const finalTotalSteps = this.currentPlan.phases.reduce(
      (sum, p) => sum + p.steps.length,
      0,
    );
    const phaseNames = this.currentPlan.phases.map((p) => p.name);
    const hasSynthesis = this.currentPlan.phases.some(
      (p) =>
        p.name.toLowerCase().includes('synth') ||
        p.name.toLowerCase().includes('answer') ||
        p.name.toLowerCase().includes('final'),
    );

    await this.reasoningTrace.emitConclusion(
      logId,
      `Research plan finalized with ${this.currentPlan.phases.length} phases and ${finalTotalSteps} steps. Plan includes ${hasSynthesis ? 'synthesis phase' : 'all required phases'} to produce comprehensive answer.`,
      [planningThoughtId],
      hasSynthesis ? 0.9 : 0.8,
      phaseNames,
    );

    this.currentPlan.status = 'executing';
    return this.currentPlan;
  }

  async replan(
    plan: Plan,
    completedPhase: Phase,
    phaseResult: PhaseResult,
    logId: string,
    failureInfo?: { message: string; code?: string; stack?: string },
  ): Promise<{ modified: boolean; plan: Plan }> {
    this.currentPlan = plan;

    await this.logService.append({
      logId,
      eventType: 'replan_triggered',
      timestamp: new Date(),
      planId: plan.id,
      phaseId: completedPhase.id,
      data: {
        reason: failureInfo ? 'failure' : 'checkpoint',
        phaseName: completedPhase.name,
      },
    });

    const context = this.buildReplanContext(
      plan,
      completedPhase,
      phaseResult,
      failureInfo,
    );

    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildReplannerSystemPrompt() },
      { role: 'user', content: context },
    ];

    const response = await this.llmService.chat(messages, planningTools);

    let modified = false;

    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      for (const toolCall of response.message.tool_calls) {
        const modifyingTools = [
          'add_step',
          'remove_step',
          'modify_step',
          'skip_phase',
          'insert_phase_after',
          'add_phase',
        ];
        if (modifyingTools.includes(toolCall.function.name)) {
          modified = true;
        }
        await this.executePlanningTool(toolCall, logId);
      }
    }

    await this.logService.append({
      logId,
      eventType: 'replan_completed',
      timestamp: new Date(),
      planId: plan.id,
      data: { modified },
    });

    return { modified, plan: this.currentPlan };
  }

  async decideRecovery(
    context: FailureContext,
    _logId: string,
  ): Promise<RecoveryDecision> {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildRecoverySystemPrompt() },
      { role: 'user', content: this.buildRecoveryPrompt(context) },
    ];

    const response = await this.llmService.chat(messages, recoveryTools);

    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      const toolCall = response.message.tool_calls[0];
      const args = toolCall.function.arguments;

      switch (toolCall.function.name) {
        case 'retry_step':
          return {
            action: 'retry',
            reason: args.reason,
            modifications: args.modifiedConfig
              ? { retryWithConfig: args.modifiedConfig }
              : undefined,
          };
        case 'skip_step':
          return { action: 'skip', reason: args.reason };
        case 'replace_step':
          return {
            action: 'alternative',
            reason: args.reason,
            modifications: {
              alternativeSteps: [
                {
                  id: randomUUID(),
                  phaseId: context.failedStep?.stepId?.split('-')[0] || '',
                  type: 'tool_call',
                  toolName: args.alternativeToolName,
                  config: args.alternativeConfig,
                  dependencies: [],
                  status: 'pending',
                  order: 0,
                },
              ],
            },
          };
        case 'abort_plan':
          return { action: 'abort', reason: args.reason };
      }
    }

    return { action: 'abort', reason: 'No recovery decision made by planner' };
  }

  setPhaseResults(phaseId: string, results: any): void {
    this.phaseResults.set(phaseId, results);
  }

  /**
   * Regenerates a plan based on evaluation feedback.
   * This is called when plan evaluation fails and provides the LLM with specific
   * guidance on how to fix the issues identified by the evaluators.
   */
  async regeneratePlanWithFeedback(
    query: string,
    logId: string,
    feedback: {
      critique: string;
      specificIssues: Array<{ issue: string; fix: string }>;
      failingDimensions: string[];
      scores: Record<string, number>;
      attemptNumber: number;
    },
  ): Promise<Plan> {
    this.currentPlan = null;
    this.phaseResults.clear();
    this.finalizeFailureCount = 0;
    this.planCreationCount = 0;

    const availableTools = this.toolExecutor.getAvailableTools();
    const systemPrompt = this.buildPlannerSystemPrompt(availableTools);

    // Emit planning_started event with feedback context
    const planningStartEntry = await this.logService.append({
      logId,
      eventType: 'planning_started',
      timestamp: new Date(),
      data: {
        query,
        availableTools: availableTools.map((t) => t.function.name),
        message: `LLM is regenerating plan (attempt ${feedback.attemptNumber + 1})...`,
        isRegeneration: true,
        attemptNumber: feedback.attemptNumber + 1,
        feedback: {
          critique: feedback.critique,
          failingDimensions: feedback.failingDimensions,
        },
      },
    });
    this.eventEmitter.emit(`log.${logId}`, planningStartEntry);

    // Build prompt that includes feedback
    const feedbackPrompt = this.buildPlanningPromptWithFeedback(
      query,
      feedback,
    );

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: feedbackPrompt },
    ];

    let planningComplete = false;
    const maxIterations = 20;
    let iteration = 0;

    while (!planningComplete && iteration < maxIterations) {
      iteration++;

      const iterationEntry = await this.logService.append({
        logId,
        eventType: 'planning_iteration',
        timestamp: new Date(),
        data: {
          iteration,
          maxIterations,
          message: `Regeneration iteration ${iteration}/${maxIterations} (attempt ${feedback.attemptNumber + 1})`,
          isRegeneration: true,
        },
      });
      this.eventEmitter.emit(`log.${logId}`, iterationEntry);

      const response = await this.llmService.chat(messages, planningTools);

      if (response.message.tool_calls?.length > 0) {
        // Push assistant message ONCE before processing tool calls (Azure OpenAI requirement)
        messages.push(response.message);

        for (const toolCall of response.message.tool_calls) {
          const result = await this.executePlanningTool(toolCall, logId);

          if (toolCall.function.name === 'finalize_plan') {
            if (!result.error) {
              planningComplete = true;
            }
          }

          messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: (toolCall as any).id } as any);
        }
      } else {
        messages.push(response.message);
        messages.push({
          role: 'user',
          content:
            'Continue building the plan or call finalize_plan when complete.',
        });
      }
    }

    if (!this.currentPlan) {
      throw new Error('Plan regeneration failed: no plan created');
    }

    // Auto-recovery for empty phases
    const emptyPhases = this.currentPlan.phases.filter(
      (p) => p.steps.length === 0,
    );
    if (emptyPhases.length > 0) {
      console.log(
        `[PlannerService] Auto-recovering ${emptyPhases.length} empty phases by adding default steps`,
      );

      await this.logService.append({
        logId,
        eventType: 'auto_recovery',
        timestamp: new Date(),
        planId: this.currentPlan.id,
        data: {
          reason:
            'LLM created phases without steps during regeneration - auto-adding default steps',
          emptyPhaseCount: emptyPhases.length,
          emptyPhaseNames: emptyPhases.map((p) => p.name),
        },
      });

      for (const phase of emptyPhases) {
        this.autoAddDefaultSteps(phase, logId);
      }
    }

    // Ensure synthesis phase exists
    await this.ensureSynthesisPhase(this.currentPlan, logId);

    this.currentPlan.status = 'executing';
    return this.currentPlan;
  }

  /**
   * Builds a planning prompt that includes feedback from the evaluation.
   */
  private buildPlanningPromptWithFeedback(
    query: string,
    feedback: {
      critique: string;
      specificIssues: Array<{ issue: string; fix: string }>;
      failingDimensions: string[];
      scores: Record<string, number>;
    },
  ): string {
    const basePrompt = this.buildPlanningPrompt(query);

    const scoresList = Object.entries(feedback.scores)
      .map(([dim, score]) => `- ${dim}: ${(score * 100).toFixed(0)}%`)
      .join('\n');

    const issuesList = feedback.specificIssues
      .map((issue) => `- Issue: ${issue.issue}\n  Fix: ${issue.fix}`)
      .join('\n');

    return `${basePrompt}

## IMPORTANT: PREVIOUS PLAN FAILED EVALUATION

The previous plan you generated failed evaluation. You MUST address the following issues:

### Evaluation Scores (0-100%)
${scoresList}

### Failing Dimensions
${feedback.failingDimensions.join(', ')}

### Critique from Evaluators
${feedback.critique}

### Specific Issues to Fix
${issuesList}

## CRITICAL REQUIREMENTS
1. **MATCH THE USER'S QUERY EXACTLY** - Your search queries MUST relate to what the user asked
2. **USE THE USER'S LANGUAGE** - If the user asks in Danish, search in Danish
3. **INCLUDE SPECIFIC DATES** - If the user mentions time references, include actual dates
4. **DO NOT HALLUCINATE** - Do not make up unrelated topics

The user asked: "${query}"

Your plan MUST directly address this query, not some other topic.`;
  }

  /**
   * Ensures the plan has a synthesis/answer generation phase.
   * This is CRITICAL - every research plan MUST produce a final answer.
   */
  private async ensureSynthesisPhase(plan: Plan, logId: string): Promise<void> {
    console.log(`[PlannerService] ensureSynthesisPhase: Starting - planId: ${plan.id}, phaseCount: ${plan.phases.length}`);

    // Check if plan already has a synthesis phase
    console.log(`[PlannerService] ensureSynthesisPhase: Checking for existing synthesis phase`);
    const hasSynthesis = plan.phases.some((phase) => {
      const phaseName = (phase.name || '').toLowerCase();
      const hasNameMatch =
        phaseName.includes('synth') ||
        phaseName.includes('answer') ||
        phaseName.includes('final') ||
        phaseName.includes('summary') ||
        phaseName.includes('conclusion');

      // Also check if phase has synthesis steps
      const hasSynthesisStep = phase.steps.some((step) => {
        const toolName = (step.toolName || '').toLowerCase();
        return (
          toolName.includes('synth') ||
          toolName === 'llm' ||
          toolName === 'text_synthesis'
        );
      });

      console.log(`[PlannerService] ensureSynthesisPhase: Checking phase "${phase.name}" - hasNameMatch: ${hasNameMatch}, hasSynthesisStep: ${hasSynthesisStep}`);
      return hasNameMatch || hasSynthesisStep;
    });

    if (hasSynthesis) {
      console.log('[PlannerService] ensureSynthesisPhase: Plan already has synthesis phase - exiting');
      return; // Plan already has synthesis
    }

    // No synthesis phase found - automatically add one
    console.log(
      '[PlannerService] ensureSynthesisPhase: No synthesis phase found - adding default synthesis phase',
    );

    console.log(`[PlannerService] ensureSynthesisPhase: Creating synthesis phase object`);
    const synthesisPhase: Phase = {
      id: randomUUID(),
      planId: plan.id,
      name: 'Synthesis & Answer Generation',
      description:
        'Generate comprehensive final answer based on all gathered research',
      status: 'pending',
      steps: [],
      replanCheckpoint: false,
      order: plan.phases.length,
    };
    console.log(`[PlannerService] ensureSynthesisPhase: Synthesis phase created - id: ${synthesisPhase.id}`);

    // Add synthesis step to the phase
    console.log(`[PlannerService] ensureSynthesisPhase: Creating synthesis step`);
    const synthesisStep: PlanStep = {
      id: randomUUID(),
      phaseId: synthesisPhase.id,
      type: 'llm',
      toolName: 'synthesize',
      config: {
        systemPrompt:
          "You are a research synthesis assistant. Analyze all provided information to generate a comprehensive, well-structured answer to the user's query.",
        prompt: `Based on all the research gathered, provide a comprehensive answer to the query: "${plan.query}"`,
      },
      dependencies: [],
      status: 'pending',
      order: 0,
    };
    console.log(`[PlannerService] ensureSynthesisPhase: Synthesis step created - id: ${synthesisStep.id}`);

    console.log(`[PlannerService] ensureSynthesisPhase: Adding step to phase`);
    synthesisPhase.steps.push(synthesisStep);
    console.log(`[PlannerService] ensureSynthesisPhase: Adding phase to plan`);
    plan.phases.push(synthesisPhase);
    console.log(`[PlannerService] ensureSynthesisPhase: Phase added - total phases: ${plan.phases.length}`);

    // Log this critical auto-recovery
    console.log(`[PlannerService] ensureSynthesisPhase: Before logService.append (synthesis_phase_auto_added)`);
    await this.logService.append({
      logId,
      eventType: 'synthesis_phase_auto_added',
      timestamp: new Date(),
      planId: plan.id,
      phaseId: synthesisPhase.id,
      data: {
        reason: 'Plan did not include a synthesis/answer generation phase',
        phaseName: synthesisPhase.name,
        stepCount: synthesisPhase.steps.length,
        message:
          'CRITICAL: Automatically added synthesis phase to ensure research produces a final answer',
      },
    });
    console.log(`[PlannerService] ensureSynthesisPhase: After logService.append - synthesis phase logged`);
    console.log(`[PlannerService] ensureSynthesisPhase: Completed successfully`);
  }

  private autoAddDefaultSteps(phase: Phase, logId: string): void {
    const phaseName = (phase.name || '').toLowerCase();
    let toolName: string = 'tavily_search'; // Initialize with default
    let stepType: string = 'search';
    let config: Record<string, any> = {};

    // Extract meaningful query from phase description or name
    const queryText = phase.description || phase.name || 'research query';

    if (phaseName.includes('search')) {
      toolName = 'tavily_search';
      stepType = 'search';
      config = { query: queryText };
    } else if (phaseName.includes('fetch')) {
      toolName = 'web_fetch';
      stepType = 'fetch';
      config = { url: phase.description || '' };
    } else if (phaseName.includes('synthes')) {
      toolName = 'synthesize';
      stepType = 'llm';
      config = { prompt: queryText };
    } else {
      // Default fallback to search (already initialized above)
      config = { query: queryText };
    }

    const step: PlanStep = {
      id: randomUUID(),
      phaseId: phase.id,
      type: stepType,
      toolName: toolName,
      config,
      dependencies: [],
      status: 'pending',
      order: 0,
    };

    phase.steps.push(step);

    this.logService.append({
      logId,
      eventType: 'step_auto_added',
      timestamp: new Date(),
      planId: this.currentPlan!.id,
      phaseId: phase.id,
      stepId: step.id,
      data: {
        reason: 'Auto-added after multiple finalize failures',
        toolName,
        type: stepType,
      },
    });
  }

  private async executePlanningTool(
    toolCall: any,
    logId: string,
  ): Promise<any> {
    const { name, arguments: args } = toolCall.function;
    let result: any;

    // Null safety check: prevent calling tools before create_plan
    if (name !== 'create_plan' && !this.currentPlan) {
      return {
        error: `Cannot call ${name} before create_plan. You must call create_plan first to initialize a plan.`,
        requiredAction: 'create_plan',
      };
    }

    switch (name) {
      case 'create_plan':
        this.planCreationCount++;
        if (this.planCreationCount > 3) {
          throw new Error(
            'Planning failed: Maximum plan creation attempts (3) exceeded. The LLM is unable to create a valid plan.',
          );
        }
        this.currentPlan = {
          id: randomUUID(),
          query: args.query,
          status: 'planning',
          phases: [],
          createdAt: new Date(),
        };
        result = { planId: this.currentPlan.id, status: 'created' };
        break;

      case 'add_phase': {
        const phase: Phase = {
          id: randomUUID(),
          planId: this.currentPlan!.id,
          name: args.name,
          description: args.description,
          status: 'pending',
          steps: [],
          replanCheckpoint: args.replanCheckpoint ?? false,
          order: this.currentPlan!.phases.length,
        };
        this.currentPlan!.phases.push(phase);
        result = { phaseId: phase.id, status: 'added' };

        const phaseEntry = await this.logService.append({
          logId,
          eventType: 'phase_added',
          timestamp: new Date(),
          planId: this.currentPlan!.id,
          phaseId: phase.id,
          data: {
            name: phase.name,
            replanCheckpoint: phase.replanCheckpoint,
            description: phase.description,
          },
        });
        this.eventEmitter.emit(`log.${logId}`, phaseEntry);
        break;
      }

      case 'add_step': {
        const targetPhase = this.currentPlan!.phases.find(
          (p) => p.id === args.phaseId,
        );
        if (!targetPhase) {
          result = { error: `Phase ${args.phaseId} not found` };
          break;
        }

        // CRITICAL VALIDATION: Ensure toolName is provided
        if (
          !args.toolName ||
          typeof args.toolName !== 'string' ||
          args.toolName.trim() === ''
        ) {
          result = {
            error:
              'toolName is required and must be a non-empty string. Available tools: tavily_search, web_fetch, synthesize',
            availableTools: ['tavily_search', 'web_fetch', 'synthesize'],
            providedToolName: args.toolName,
          };
          break;
        }

        // CRITICAL VALIDATION: Ensure config is provided with meaningful parameters
        if (
          !args.config ||
          typeof args.config !== 'object' ||
          Object.keys(args.config).length === 0
        ) {
          result = {
            error: `config is REQUIRED and must be a non-empty object with specific parameters for ${args.toolName}. Examples:
- tavily_search requires: {query: "specific search terms", max_results: 5}
- web_fetch requires: {url: "https://specific-url.com"}
- synthesize requires: {prompt: "detailed synthesis instructions"}`,
            toolName: args.toolName,
            providedConfig: args.config,
          };
          break;
        }

        // Tool-specific config validation
        if (args.toolName === 'tavily_search') {
          if (
            !args.config.query ||
            typeof args.config.query !== 'string' ||
            args.config.query.trim() === ''
          ) {
            result = {
              error:
                'tavily_search requires a non-empty "query" field in config. Example: {query: "latest antimatter news 2024", max_results: 5}',
              providedConfig: args.config,
            };
            break;
          }
        } else if (args.toolName === 'web_fetch') {
          if (
            !args.config.url ||
            typeof args.config.url !== 'string' ||
            args.config.url.trim() === ''
          ) {
            result = {
              error:
                'web_fetch requires a non-empty "url" field in config. Example: {url: "https://example.com/article"}',
              providedConfig: args.config,
            };
            break;
          }
        } else if (args.toolName === 'synthesize') {
          if (
            !args.config.prompt ||
            typeof args.config.prompt !== 'string' ||
            args.config.prompt.trim() === ''
          ) {
            result = {
              error:
                'synthesize requires a non-empty "prompt" field in config. Example: {prompt: "Synthesize the research findings about antimatter"}',
              providedConfig: args.config,
            };
            break;
          }
        }

        const step: PlanStep = {
          id: randomUUID(),
          phaseId: args.phaseId,
          type: args.type,
          toolName: args.toolName,
          config: args.config,
          dependencies: args.dependsOn ?? [],
          status: 'pending',
          order: targetPhase.steps.length,
        };
        targetPhase.steps.push(step);
        result = { stepId: step.id, status: 'added' };

        const stepEntry = await this.logService.append({
          logId,
          eventType: 'step_added',
          timestamp: new Date(),
          planId: this.currentPlan!.id,
          phaseId: args.phaseId,
          stepId: step.id,
          data: {
            toolName: args.toolName,
            type: args.type,
            config: args.config,
          },
        });
        this.eventEmitter.emit(`log.${logId}`, stepEntry);
        break;
      }

      case 'modify_step': {
        const step = this.findStep(args.stepId);
        if (step) {
          Object.assign(step, args.changes);
          result = { stepId: args.stepId, status: 'modified' };

          await this.logService.append({
            logId,
            eventType: 'step_modified',
            timestamp: new Date(),
            planId: this.currentPlan!.id,
            stepId: args.stepId,
            data: { changes: args.changes },
          });
        } else {
          result = { error: `Step ${args.stepId} not found` };
        }
        break;
      }

      case 'remove_step': {
        const removed = this.removeStep(args.stepId);
        result = {
          stepId: args.stepId,
          status: removed ? 'removed' : 'not_found',
        };

        if (removed) {
          await this.logService.append({
            logId,
            eventType: 'step_removed',
            timestamp: new Date(),
            planId: this.currentPlan!.id,
            stepId: args.stepId,
            data: { reason: args.reason },
          });
        }
        break;
      }

      case 'skip_phase': {
        const phase = this.currentPlan!.phases.find(
          (p) => p.id === args.phaseId,
        );
        if (phase) {
          phase.status = 'skipped';
          result = { phaseId: args.phaseId, status: 'skipped' };
        } else {
          result = { error: `Phase ${args.phaseId} not found` };
        }
        break;
      }

      case 'insert_phase_after': {
        const afterIndex = this.currentPlan!.phases.findIndex(
          (p) => p.id === args.afterPhaseId,
        );
        if (afterIndex >= 0) {
          const newPhase: Phase = {
            id: randomUUID(),
            planId: this.currentPlan!.id,
            name: args.name,
            description: args.description,
            status: 'pending',
            steps: [],
            replanCheckpoint: args.replanCheckpoint ?? false,
            order: afterIndex + 1,
          };
          this.currentPlan!.phases.splice(afterIndex + 1, 0, newPhase);
          // Reorder subsequent phases
          for (
            let i = afterIndex + 2;
            i < this.currentPlan!.phases.length;
            i++
          ) {
            this.currentPlan!.phases[i].order = i;
          }
          result = { phaseId: newPhase.id, status: 'inserted' };

          await this.logService.append({
            logId,
            eventType: 'phase_added',
            timestamp: new Date(),
            planId: this.currentPlan!.id,
            phaseId: newPhase.id,
            data: { name: newPhase.name, insertedAfter: args.afterPhaseId },
          });
        } else {
          result = { error: `Phase ${args.afterPhaseId} not found` };
        }
        break;
      }

      case 'get_plan_status':
        result = this.getPlanSummary();
        break;

      case 'get_phase_results':
        result = this.phaseResults.get(args.phaseId) || {
          error: 'No results for phase',
        };
        break;

      case 'finalize_plan': {
        // Validate that all phases have at least one step
        const emptyPhases = this.currentPlan!.phases.filter(
          (p) => p.steps.length === 0,
        );

        if (emptyPhases.length > 0) {
          this.finalizeFailureCount++;

          // After 2 failures, auto-add default steps
          if (this.finalizeFailureCount >= 2) {
            await this.logService.append({
              logId,
              eventType: 'auto_recovery',
              timestamp: new Date(),
              planId: this.currentPlan!.id,
              data: {
                reason:
                  'Auto-adding default steps after multiple finalize failures',
                emptyPhaseCount: emptyPhases.length,
                failureCount: this.finalizeFailureCount,
              },
            });

            for (const phase of emptyPhases) {
              this.autoAddDefaultSteps(phase, logId);
            }

            result = {
              status: 'finalized',
              totalPhases: this.currentPlan!.phases.length,
              totalSteps: this.currentPlan!.phases.reduce(
                (sum, p) => sum + p.steps.length,
                0,
              ),
              autoRecovered: true,
              message:
                'Plan finalized with auto-generated default steps after multiple failures',
            };
          } else {
            const phaseList = emptyPhases
              .map((p) => `"${p.name}" (${p.id})`)
              .join(', ');
            result = {
              error: `Cannot finalize plan: The following phases have no steps: ${phaseList}. Each phase MUST have at least one step. DO NOT create a new plan - use add_step to add steps to the EXISTING phases with the provided phase IDs before calling finalize_plan again. Failure count: ${this.finalizeFailureCount}/2`,
              emptyPhases: emptyPhases.map((p) => ({
                id: p.id,
                name: p.name,
              })),
              instruction:
                'Use add_step with the phase IDs above. Do NOT call create_plan again.',
            };
          }
        } else {
          result = {
            status: 'finalized',
            totalPhases: this.currentPlan!.phases.length,
            totalSteps: this.currentPlan!.phases.reduce(
              (sum, p) => sum + p.steps.length,
              0,
            ),
          };
        }
        break;
      }

      default:
        result = { error: `Unknown planning tool: ${name}` };
    }

    return result;
  }

  private findStep(stepId: string): PlanStep | undefined {
    for (const phase of this.currentPlan!.phases) {
      const step = phase.steps.find((s) => s.id === stepId);
      if (step) return step;
    }
    return undefined;
  }

  private removeStep(stepId: string): boolean {
    for (const phase of this.currentPlan!.phases) {
      const index = phase.steps.findIndex((s) => s.id === stepId);
      if (index >= 0) {
        phase.steps.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  private getPlanSummary(): any {
    if (!this.currentPlan) return { error: 'No plan created' };

    return {
      planId: this.currentPlan.id,
      query: this.currentPlan.query,
      status: this.currentPlan.status,
      phases: this.currentPlan.phases.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        stepCount: p.steps.length,
        replanCheckpoint: p.replanCheckpoint,
      })),
    };
  }

  private buildPlannerSystemPrompt(availableTools: ToolDefinition[]): string {
    const toolList = availableTools
      .map((t) => `- ${t.function.name}: ${t.function.description}`)
      .join('\n');

    return `You are a research planning agent. Your job is to analyze a user's research query and create a detailed execution plan.

## Available Execution Tools
${toolList}

## Planning Process
1. Call create_plan to initialize the plan
2. **FIRST: Check if knowledge_search is relevant** - If the query relates to previously researched topics, start with knowledge_search to leverage existing research
3. For each major phase (e.g., search, fetch, synthesize):
   a. Call add_phase to create the phase - NOTE THE RETURNED phaseId
   b. **IMMEDIATELY call add_step one or more times with that phaseId**
   c. **CRITICAL: ALWAYS provide the config parameter with specific, detailed parameters:**
      - For knowledge_search: include {query: "semantic search query", max_results: 5} - USE THIS FIRST for related/follow-up questions
      - For tavily_search: include {query: "specific search terms", max_results: 5}
      - For web_fetch: include {url: "https://specific-url.com"}
      - For synthesize: include {prompt: "detailed synthesis instructions"}
   d. Only after adding steps with complete configs, move to the next phase
4. Set replanCheckpoint=true on phases where results might change the approach
5. Call finalize_plan when ALL phases have steps with complete configs

## When to Use knowledge_search (Internal Knowledge Base)
**ALWAYS consider knowledge_search FIRST when:**
- The query mentions "previous research", "earlier", "related to", or similar references
- The query is a follow-up or expansion on a topic that may have been researched before
- The query asks to compare, contrast, or build upon existing knowledge
- You want to avoid redundant external searches for already-researched topics

**knowledge_search uses semantic search** to find relevant prior research results. It's faster and provides context from previous investigations.

## CRITICAL REQUIREMENTS - ABSOLUTE MUST-HAVES
- **EVERY PLAN MUST END WITH A SYNTHESIS/ANSWER GENERATION PHASE**
- **The synthesis phase MUST use the "synthesize" tool to generate a final answer**
- **Research without a final answer is INCOMPLETE and UNUSABLE**
- **finalize_plan will REJECT the plan if ANY phase has zero steps**
- **A phase without steps cannot execute and will fail**
- **You MUST add at least one step to EVERY phase before calling finalize_plan**
- Use the phaseId returned from add_phase when calling add_step
- The replan checkpoint is for ADJUSTING the plan based on results, NOT for creating the initial steps

## Mandatory Plan Structure
1. Information Gathering Phase(s) - search, fetch, etc.
2. **SYNTHESIS PHASE (MANDATORY)** - MUST use "synthesize" tool to create final answer

## Guidelines
- Create atomic, granular steps. Each step should do ONE thing.
- Consider dependencies between steps - use dependsOn when a step needs prior results.
- For search tasks, create multiple search steps with different queries for thorough coverage.
- **ALWAYS provide specific config parameters for EVERY step - never create a step without config**
- For fetch tasks, plan to fetch from multiple sources.
- **ALWAYS end with a synthesis phase that uses the "synthesize" tool**
- The synthesis step should combine all gathered information into a comprehensive answer

## Example Flow (FOLLOW THIS PATTERN)
1. create_plan({query: "user query", name: "Research Plan"})
2. add_phase({name: "Initial Search", description: "Search for information"}) -> returns {phaseId: "abc"}
3. add_step({phaseId: "abc", type: "tool_call", toolName: "tavily_search", config: {query: "latest antimatter news 2024", max_results: 5}})
4. add_step({phaseId: "abc", type: "tool_call", toolName: "tavily_search", config: {query: "antimatter breakthrough research 2024", max_results: 5}})
5. add_phase({name: "Content Fetching", description: "Fetch detailed articles"}) -> returns {phaseId: "def"}
6. add_step({phaseId: "def", type: "tool_call", toolName: "web_fetch", config: {url: "https://example.com/article"}})
7. **add_phase({name: "Synthesis & Answer Generation", description: "Generate final answer"}) -> returns {phaseId: "xyz"}**
8. **add_step({phaseId: "xyz", type: "llm_call", toolName: "synthesize", config: {prompt: "Synthesize all gathered antimatter research into a comprehensive answer"}}) -> CRITICAL FINAL STEP**
9. finalize_plan()

## WARNING
If you create a plan without a synthesis phase, the research will fail to produce an answer.
The user expects a comprehensive answer, not just raw data.`;
  }

  private buildPlanningPrompt(query: string): string {
    // Analyze query for language and date extraction
    const enhancement: QueryEnhancementMetadata = analyzeQuery(query);

    const enhancementSection = `
## Query Analysis & Enhancement Guidance
- **Detected Language**: ${enhancement.detectedLanguage}
- **Extracted Dates**: ${enhancement.formattedDates.length > 0 ? enhancement.formattedDates.join(', ') : 'None'}
- **Has Temporal Reference**: ${enhancement.hasTemporalReference ? 'Yes' : 'No'}

### CRITICAL SEARCH QUERY REQUIREMENTS
${enhancement.suggestions.map((s) => `- ${s}`).join('\n')}

**EXAMPLES OF CORRECT QUERY GENERATION:**

If user asks "Hvad sker der i Aarhus i dag og i morgen?" (Danish, asking about today and tomorrow):
❌ WRONG: {query: "events in Aarhus today and tomorrow"} - Wrong language, vague dates
❌ WRONG: {query: "events in Aarhus 2023"} - Wrong year
✅ CORRECT: {query: "begivenheder Aarhus ${enhancement.formattedDates[0] || 'YYYY-MM-DD'}"} - Matches language, specific date

If user asks "What's happening in Copenhagen this weekend?" (English):
❌ WRONG: {query: "begivenheder København"} - Wrong language
❌ WRONG: {query: "events Copenhagen"} - Missing dates
✅ CORRECT: {query: "events Copenhagen 2025-12-07 OR 2025-12-08"} - Correct language, specific dates
`;

    return `Create an execution plan for the following research query:

"${query}"
${enhancementSection}

REQUIREMENTS:
1. Start by calling create_plan
2. Add information gathering phases (search, fetch, etc.) with their steps
3. **CRITICAL: EVERY add_step call MUST include a config parameter with specific details:**
   - For tavily_search: provide {query: "specific search terms IN THE USER'S LANGUAGE with SPECIFIC DATES", max_results: 5}
   - For web_fetch: provide {url: "https://specific-url.com"}
   - For synthesize: provide {prompt: "detailed instructions IN ENGLISH"}
4. **MANDATORY: Add a final synthesis phase using the "synthesize" tool to generate the answer**
5. Call finalize_plan when done

**LANGUAGE USAGE REQUIREMENTS:**
- Search queries (tavily_search) MUST be in the user's language: ${enhancement.detectedLanguage}
- Search queries MUST include specific dates: ${enhancement.formattedDates.join(', ') || 'if temporal references exist'}
- **ALL SYNTHESIS PROMPTS (synthesize tool config.prompt) MUST BE IN ENGLISH**
- Internal instructions and prompts MUST be in English
- Only the final answer to the user can be in the user's language

Remember:
- EVERY step MUST have a config parameter with specific values
- The plan MUST end with a synthesis phase that produces a comprehensive answer to the query
- Synthesis/internal prompts = English, Search queries = User's language (${enhancement.detectedLanguage}), Final answer = User's language`;
  }

  private buildReplannerSystemPrompt(): string {
    return `You are reviewing a research plan at a checkpoint. Based on the results so far, decide if the plan needs modification.

You can:
- add_step: Add new steps to gather more information
- remove_step: Remove steps that are no longer needed
- modify_step: Change step configuration
- skip_phase: Skip remaining phases if we have enough information
- add_phase: Add a new phase if needed

If the plan is good as-is, don't make any changes.`;
  }

  private buildReplanContext(
    plan: Plan,
    completedPhase: Phase,
    phaseResult: PhaseResult,
    failureInfo?: { message: string; code?: string; stack?: string },
  ): string {
    const summary = this.getPlanSummary();
    const resultsSummary = phaseResult.stepResults.map((r) => ({
      stepId: r.stepId,
      status: r.status,
      hasOutput: !!r.output,
    }));

    return `## Plan Summary
${JSON.stringify(summary, null, 2)}

## Completed Phase
Name: ${completedPhase.name}
Status: ${phaseResult.status}

## Phase Results
${JSON.stringify(resultsSummary, null, 2)}

${failureInfo ? `## Failure Info\n${JSON.stringify(failureInfo, null, 2)}` : ''}

## Remaining Phases
${plan.phases
  .filter((p) => p.status === 'pending')
  .map((p) => p.name)
  .join(', ')}

Review the results and decide if the plan needs modification.`;
  }

  private buildRecoverySystemPrompt(): string {
    return `You are handling a failure in a research plan. Decide the best recovery action:

- retry_step: Try again, optionally with modified parameters
- skip_step: Skip this step if the plan can succeed without it
- replace_step: Use a different tool/approach
- abort_plan: Give up if recovery is impossible

Choose the most appropriate action based on the failure context.`;
  }

  private buildRecoveryPrompt(context: FailureContext): string {
    return `## Plan Summary
${context.planSummary}

## Failure Details
- Phase: ${context.failedPhase}
- Step: ${context.failedStep?.toolName || 'unknown'}
- Config: ${JSON.stringify(context.failedStep?.config)}
- Error: ${context.failedStep?.error?.message}

## Completed Steps
${context.completedSteps.join(', ') || 'None'}

## Remaining Phases
${context.remainingPhases.join(', ') || 'None'}

Choose the best recovery action.`;
  }
}
