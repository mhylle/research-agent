// src/orchestration/phase-executors/generic-phase-executor.ts
import { Injectable } from '@nestjs/common';
import { BasePhaseExecutor } from './base-phase-executor';
import { Phase } from '../interfaces/phase.interface';

/**
 * Generic fallback phase executor.
 * Handles any phase that is not matched by more specific executors.
 * Uses all default behavior from BasePhaseExecutor.
 */
@Injectable()
export class GenericPhaseExecutor extends BasePhaseExecutor {
  /**
   * This is the fallback executor - it handles all phases
   */
  canHandle(phase: Phase): boolean {
    return true;
  }
}
