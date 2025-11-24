import { Injectable } from '@nestjs/common';
import { Executor } from './interfaces/executor.interface';

@Injectable()
export class ExecutorRegistry {
  private executors = new Map<string, Executor>();

  register(type: string, executor: Executor): void {
    this.executors.set(type, executor);
  }

  getExecutor(type: string): Executor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`No executor registered for type: ${type}`);
    }
    return executor;
  }

  hasExecutor(type: string): boolean {
    return this.executors.has(type);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.executors.keys());
  }
}
