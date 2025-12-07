import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  WorkingMemory,
  SubGoal,
  GatheredInfo,
  Hypothesis,
  Gap,
} from '../interfaces/working-memory.interface';

@Injectable()
export class WorkingMemoryService {
  private memories = new Map<string, WorkingMemory>();

  initialize(logId: string, query: string): WorkingMemory {
    const memory: WorkingMemory = {
      taskId: randomUUID(),
      logId,
      query,
      startTime: new Date(),
      currentPhase: 'initialization',
      currentStep: 0,
      primaryGoal: `Answer the query: "${query}"`,
      subGoals: [],
      gatheredInformation: [],
      activeHypotheses: [],
      identifiedGaps: [],
      scratchPad: new Map(),
      thoughtChain: [],
    };

    this.memories.set(logId, memory);
    return memory;
  }

  get(logId: string): WorkingMemory | undefined {
    return this.memories.get(logId);
  }

  updatePhase(logId: string, phase: string, step: number): void {
    const memory = this.memories.get(logId);
    if (memory) {
      memory.currentPhase = phase;
      memory.currentStep = step;
    }
  }

  addSubGoal(logId: string, goal: Omit<SubGoal, 'id'>): string {
    const memory = this.memories.get(logId);
    if (!memory) throw new Error(`No working memory for logId: ${logId}`);

    const subGoal: SubGoal = {
      ...goal,
      id: randomUUID(),
    };
    memory.subGoals.push(subGoal);
    return subGoal.id;
  }

  updateSubGoalStatus(
    logId: string,
    goalId: string,
    status: SubGoal['status'],
  ): void {
    const memory = this.memories.get(logId);
    if (!memory) return;

    const goal = memory.subGoals.find((g) => g.id === goalId);
    if (goal) {
      goal.status = status;
    }
  }

  addGatheredInfo(
    logId: string,
    info: Omit<GatheredInfo, 'id' | 'addedAt'>,
  ): string {
    const memory = this.memories.get(logId);
    if (!memory) throw new Error(`No working memory for logId: ${logId}`);

    const gathered: GatheredInfo = {
      ...info,
      id: randomUUID(),
      addedAt: new Date(),
    };
    memory.gatheredInformation.push(gathered);
    return gathered.id;
  }

  addHypothesis(logId: string, statement: string, confidence: number): string {
    const memory = this.memories.get(logId);
    if (!memory) throw new Error(`No working memory for logId: ${logId}`);

    const hypothesis: Hypothesis = {
      id: randomUUID(),
      statement,
      confidence,
      supportingEvidence: [],
      contradictingEvidence: [],
    };
    memory.activeHypotheses.push(hypothesis);
    return hypothesis.id;
  }

  updateHypothesisEvidence(
    logId: string,
    hypothesisId: string,
    evidenceType: 'supporting' | 'contradicting',
    evidence: string,
  ): void {
    const memory = this.memories.get(logId);
    if (!memory) return;

    const hypothesis = memory.activeHypotheses.find(
      (h) => h.id === hypothesisId,
    );
    if (hypothesis) {
      if (evidenceType === 'supporting') {
        hypothesis.supportingEvidence.push(evidence);
      } else {
        hypothesis.contradictingEvidence.push(evidence);
      }
    }
  }

  addGap(logId: string, gap: Omit<Gap, 'id'>): string {
    const memory = this.memories.get(logId);
    if (!memory) throw new Error(`No working memory for logId: ${logId}`);

    const identifiedGap: Gap = {
      ...gap,
      id: randomUUID(),
    };
    memory.identifiedGaps.push(identifiedGap);
    return identifiedGap.id;
  }

  resolveGap(logId: string, gapId: string): void {
    const memory = this.memories.get(logId);
    if (!memory) return;

    const index = memory.identifiedGaps.findIndex((g) => g.id === gapId);
    if (index >= 0) {
      memory.identifiedGaps.splice(index, 1);
    }
  }

  setScratchPadValue(logId: string, key: string, value: unknown): void {
    const memory = this.memories.get(logId);
    if (memory) {
      memory.scratchPad.set(key, value);
    }
  }

  getScratchPadValue<T>(logId: string, key: string): T | undefined {
    const memory = this.memories.get(logId);
    return memory?.scratchPad.get(key) as T | undefined;
  }

  addThought(logId: string, thoughtId: string): void {
    const memory = this.memories.get(logId);
    if (memory) {
      memory.thoughtChain.push(thoughtId);
    }
  }

  getContext(logId: string): string {
    const memory = this.memories.get(logId);
    if (!memory) return '';

    const recentInfo = memory.gatheredInformation.slice(-5);
    const activeGaps = memory.identifiedGaps.filter(
      (g) => g.severity !== 'minor',
    );

    return `
Current Phase: ${memory.currentPhase} (Step ${memory.currentStep})
Primary Goal: ${memory.primaryGoal}

Sub-goals:
${memory.subGoals.map((g) => `- [${g.status}] ${g.description}`).join('\n') || '- None'}

Gathered Information (${memory.gatheredInformation.length} items):
${recentInfo.map((i) => `- ${i.content.substring(0, 100)}...`).join('\n') || '- None yet'}

Active Hypotheses:
${memory.activeHypotheses.map((h) => `- ${h.statement} (confidence: ${(h.confidence * 100).toFixed(0)}%)`).join('\n') || '- None'}

Identified Gaps:
${activeGaps.map((g) => `- [${g.severity}] ${g.description}`).join('\n') || '- None'}
`.trim();
  }

  getStatistics(logId: string): Record<string, number> | undefined {
    const memory = this.memories.get(logId);
    if (!memory) return undefined;

    return {
      subGoalsTotal: memory.subGoals.length,
      subGoalsCompleted: memory.subGoals.filter((g) => g.status === 'completed')
        .length,
      gatheredInfoCount: memory.gatheredInformation.length,
      hypothesesCount: memory.activeHypotheses.length,
      gapsCount: memory.identifiedGaps.length,
      criticalGaps: memory.identifiedGaps.filter(
        (g) => g.severity === 'critical',
      ).length,
      thoughtChainLength: memory.thoughtChain.length,
    };
  }

  cleanup(logId: string): void {
    this.memories.delete(logId);
  }
}
