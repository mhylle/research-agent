import { Test, TestingModule } from '@nestjs/testing';
import { ExecutorRegistry } from './executor-registry.service';
import { Executor } from './interfaces/executor.interface';

describe('ExecutorRegistry', () => {
  let registry: ExecutorRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutorRegistry],
    }).compile();

    registry = module.get<ExecutorRegistry>(ExecutorRegistry);
  });

  describe('register', () => {
    it('should register an executor', () => {
      const mockExecutor: Executor = {
        execute: jest.fn(),
      };

      registry.register('test_type', mockExecutor);

      expect(registry.getExecutor('test_type')).toBe(mockExecutor);
    });
  });

  describe('getExecutor', () => {
    it('should throw if executor not found', () => {
      expect(() => registry.getExecutor('unknown')).toThrow(
        'No executor registered for type: unknown',
      );
    });
  });
});
