// @ts-nocheck
// src/orchestration/planner.service.ts
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OllamaService } from '../llm/ollama.service';
import { ToolExecutor } from '../executors/tool.executor';
import { LogService } from '../logging/log.service';
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

@Injectable()
export class PlannerService {
  private currentPlan: Plan | null = null;
  private phaseResults: Map<string, any> = new Map();
  private finalizeFailureCount: number = 0;
  private planCreationCount: number = 0;

  constructor(
    private llmService: OllamaService,
    private toolExecutor: ToolExecutor,
    private logService: LogService,
  ) {}

  async createPlan(query: string, logId: string): Promise<Plan> {
    this.currentPlan = null;
    this.phaseResults.clear();
    this.finalizeFailureCount = 0;
    this.planCreationCount = 0;

    const availableTools = this.toolExecutor.getAvailableTools();
    const systemPrompt = this.buildPlannerSystemPrompt(availableTools);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildPlanningPrompt(query) },
    ];

    let planningComplete = false;
    const maxIterations = 20;
    let iteration = 0;

    while (!planningComplete && iteration < maxIterations) {
      iteration++;

      const response = await this.llmService.chat(messages, planningTools);

      if (response.message.tool_calls?.length > 0) {
        for (const toolCall of response.message.tool_calls) {
          const result = await this.executePlanningTool(toolCall, logId);

          if (toolCall.function.name === 'finalize_plan') {
            // Only mark as complete if finalize_plan succeeded (no error)
            if (!result.error) {
              planningComplete = true;
            }
          }

          messages.push(response.message);
          messages.push({ role: 'tool', content: JSON.stringify(result) });
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
      throw new Error('Planning failed: no plan created');
    }

    // Final validation: ensure no phases are empty
    const emptyPhases = this.currentPlan.phases.filter(
      (p) => p.steps.length === 0,
    );
    if (emptyPhases.length > 0) {
      const phaseNames = emptyPhases.map((p) => p.name).join(', ');
      throw new Error(
        `Planning failed: The following phases have no steps: ${phaseNames}. Cannot execute a plan with empty phases.`,
      );
    }

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

  private autoAddDefaultSteps(phase: Phase, logId: string): void {
    const phaseName = phase.name.toLowerCase();
    let toolName: string;
    let stepType: string;

    if (phaseName.includes('search')) {
      toolName = 'tavily_search';
      stepType = 'search';
    } else if (phaseName.includes('fetch')) {
      toolName = 'web_fetch';
      stepType = 'fetch';
    } else if (phaseName.includes('synthes')) {
      toolName = 'synthesize';
      stepType = 'llm';
    } else {
      // Default fallback
      toolName = 'tavily_search';
      stepType = 'search';
    }

    const step: PlanStep = {
      id: randomUUID(),
      phaseId: phase.id,
      type: stepType,
      toolName: toolName,
      config: {},
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

        await this.logService.append({
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

        await this.logService.append({
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
                reason: 'Auto-adding default steps after multiple finalize failures',
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
2. For each major phase (e.g., search, fetch, synthesize):
   a. Call add_phase to create the phase - NOTE THE RETURNED phaseId
   b. **IMMEDIATELY call add_step one or more times with that phaseId**
   c. Only after adding steps, move to the next phase
3. Set replanCheckpoint=true on phases where results might change the approach
4. Call finalize_plan when ALL phases have steps

## CRITICAL REQUIREMENTS
- **finalize_plan will REJECT the plan if ANY phase has zero steps**
- **A phase without steps cannot execute and will fail**
- **You MUST add at least one step to EVERY phase before calling finalize_plan**
- Use the phaseId returned from add_phase when calling add_step
- The replan checkpoint is for ADJUSTING the plan based on results, NOT for creating the initial steps

## Guidelines
- Create atomic, granular steps. Each step should do ONE thing.
- Consider dependencies between steps - use dependsOn when a step needs prior results.
- For search tasks, create multiple search steps with different queries for thorough coverage.
- For fetch tasks, plan to fetch from multiple sources.
- Always include a synthesis phase at the end to combine results.

## Example Flow
1. create_plan
2. add_phase("search", ...) -> returns {phaseId: "abc"}
3. add_step(phaseId="abc", toolName="tavily_search", ...) -> step added to search phase
4. add_step(phaseId="abc", toolName="tavily_search", ...) -> another search step
5. add_phase("fetch", ...) -> returns {phaseId: "def"}
6. add_step(phaseId="def", toolName="web_fetch", ...) -> step added to fetch phase
7. ... continue adding phases and steps
8. finalize_plan`;
  }

  private buildPlanningPrompt(query: string): string {
    return `Create an execution plan for the following research query:

"${query}"

Start by calling create_plan, then add phases and steps. Call finalize_plan when done.`;
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
