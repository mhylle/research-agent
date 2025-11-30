// src/orchestration/phase-executors/phase-executor-registry.ts
import { Injectable } from '@nestjs/common';
import { IPhaseExecutor } from './interfaces/phase-executor.interface';
import { Phase } from '../interfaces/phase.interface';
import { SearchPhaseExecutor } from './search-phase-executor';
import { FetchPhaseExecutor } from './fetch-phase-executor';
import { SynthesisPhaseExecutor } from './synthesis-phase-executor';
import { GenericPhaseExecutor } from './generic-phase-executor';

/**
 * Registry that manages phase executor selection.
 * Selects the most appropriate executor for a given phase based on phase characteristics.
 * Executors are ordered from most specific to most generic.
 */
@Injectable()
export class PhaseExecutorRegistry {
  private readonly executors: IPhaseExecutor[];

  constructor(
    private readonly searchExecutor: SearchPhaseExecutor,
    private readonly fetchExecutor: FetchPhaseExecutor,
    private readonly synthesisExecutor: SynthesisPhaseExecutor,
    private readonly genericExecutor: GenericPhaseExecutor,
  ) {
    // Order matters: most specific first, generic fallback last
    this.executors = [
      this.searchExecutor,
      this.fetchExecutor,
      this.synthesisExecutor,
      this.genericExecutor, // Fallback - always matches
    ];
  }

  /**
   * Get the appropriate executor for a phase.
   * Returns the first executor that can handle the phase.
   * Falls back to GenericPhaseExecutor if no specific match found.
   */
  getExecutor(phase: Phase): IPhaseExecutor {
    const executor = this.executors.find((e) => e.canHandle(phase));
    return executor || this.genericExecutor;
  }
}
