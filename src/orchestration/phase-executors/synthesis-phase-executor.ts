// src/orchestration/phase-executors/synthesis-phase-executor.ts
import { Injectable } from '@nestjs/common';
import { BasePhaseExecutor } from './base-phase-executor';
import { Phase } from '../interfaces/phase.interface';

/**
 * Executor for synthesis/answer/generation phases.
 * Uses default execute() from base class.
 * Synthesis steps are enriched by StepConfigurationService via base class executeStep().
 */
@Injectable()
export class SynthesisPhaseExecutor extends BasePhaseExecutor {
  /**
   * Handles phases with 'synth', 'answer', or 'generat' in the name
   */
  canHandle(phase: Phase): boolean {
    const phaseName = phase.name.toLowerCase();
    return (
      phaseName.includes('synth') ||
      phaseName.includes('answer') ||
      phaseName.includes('generat')
    );
  }

  // No override of execute() - uses BasePhaseExecutor.execute()
  // Step enrichment happens in BasePhaseExecutor.executeStep() via StepConfigurationService
}
