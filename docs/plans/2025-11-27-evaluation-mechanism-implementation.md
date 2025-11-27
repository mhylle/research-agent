# Evaluation Mechanism Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dual-mode evaluation system that validates research quality at runtime (with plan iteration) and analyzes results offline for prompt improvement.

**Architecture:** Role-based LLM panel evaluates plans using multiple small models, aggregates scores weighted by confidence, and escalates to larger model on uncertainty. Evaluation is a fail-safe addon - if it fails, research continues uninterrupted.

**Tech Stack:** NestJS, TypeORM, Ollama (llama3.1:8b, qwen3:14b, qwen3:30b), Angular

---

## Phase 1: Foundation (Core Infrastructure)

### Task 1.1: Create Evaluation Module Structure

**Files:**
- Create: `src/evaluation/evaluation.module.ts`
- Create: `src/evaluation/evaluation.controller.ts`
- Create: `src/evaluation/services/evaluation.service.ts`

**Step 1: Create the evaluation module**

```typescript
// src/evaluation/evaluation.module.ts
import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './services/evaluation.service';

@Module({
  controllers: [EvaluationController],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
```

**Step 2: Create placeholder service**

```typescript
// src/evaluation/services/evaluation.service.ts
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  async evaluatePlan(plan: any, query: string): Promise<any> {
    this.logger.log('Plan evaluation not yet implemented');
    return { passed: true, scores: {}, evaluationSkipped: true };
  }
}
```

**Step 3: Create placeholder controller**

```typescript
// src/evaluation/evaluation.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller('api/evaluation')
export class EvaluationController {
  @Get('health')
  health() {
    return { status: 'ok', module: 'evaluation' };
  }
}
```

**Step 4: Register module in app.module.ts**

Modify `src/app.module.ts` - add EvaluationModule to imports array.

**Step 5: Run tests and verify app starts**

Run: `npm run build && npm run start:dev`
Expected: App starts, GET /api/evaluation/health returns 200

**Step 6: Commit**

```bash
git add src/evaluation/
git add src/app.module.ts
git commit -m "feat(evaluation): add evaluation module structure"
```

---

### Task 1.2: Create Evaluation Interfaces

**Files:**
- Create: `src/evaluation/interfaces/evaluation-result.interface.ts`
- Create: `src/evaluation/interfaces/dimension-scores.interface.ts`
- Create: `src/evaluation/interfaces/evaluator-config.interface.ts`

**Step 1: Create dimension scores interface**

```typescript
// src/evaluation/interfaces/dimension-scores.interface.ts
export interface DimensionScores {
  [dimension: string]: number;
}

export interface PlanDimensionScores extends DimensionScores {
  intentAlignment: number;
  queryCoverage: number;
  scopeAppropriateness: number;
}

export interface RetrievalDimensionScores extends DimensionScores {
  contextRecall: number;
  contextPrecision: number;
  sourceQuality: number;
}

export interface AnswerDimensionScores extends DimensionScores {
  faithfulness: number;
  relevance: number;
  factualAccuracy: number;
  completeness: number;
  coherence: number;
}
```

**Step 2: Create evaluation result interface**

```typescript
// src/evaluation/interfaces/evaluation-result.interface.ts
import { DimensionScores } from './dimension-scores.interface';

export interface EvaluatorResult {
  role: string;
  model: string;
  dimensions: string[];
  scores: DimensionScores;
  confidence: number;
  critique: string;
  rawResponse: string;
  latency: number;
  tokensUsed: number;
}

export interface EscalationResult {
  trigger: 'low_confidence' | 'disagreement' | 'borderline';
  model: string;
  panelReview: string;
  trustDecisions: Record<string, number>;
  finalVerdict: string;
  scores: DimensionScores;
  latency: number;
  tokensUsed: number;
}

export interface IterationDecision {
  mode: 'targeted_fix' | 'full_regeneration' | 'alternative_approach';
  specificIssues: Array<{ issue: string; fix: string }>;
  feedbackToPlanner: string;
}

export interface PlanAttempt {
  attemptNumber: number;
  timestamp: Date;
  plan: any;
  evaluatorResults: EvaluatorResult[];
  aggregatedScores: DimensionScores;
  aggregatedConfidence: number;
  passed: boolean;
  escalation?: EscalationResult;
  iterationDecision?: IterationDecision;
}

export interface EvaluationResult {
  passed: boolean;
  scores: DimensionScores;
  confidence: number;
  critique?: string;
  evaluationSkipped: boolean;
  skipReason?: string;
}

export interface PlanEvaluationResult extends EvaluationResult {
  attempts: PlanAttempt[];
  totalIterations: number;
  escalatedToLargeModel: boolean;
}
```

**Step 3: Create evaluator config interface**

```typescript
// src/evaluation/interfaces/evaluator-config.interface.ts
export interface EvaluatorRoleConfig {
  model: string;
  fallback?: string;
  dimensions: string[];
  promptTemplate: string;
}

export interface EvaluationConfig {
  enabled: boolean;

  planEvaluation: {
    enabled: boolean;
    iterationEnabled: boolean;
    maxAttempts: number;
    timeout: number;
    passThreshold: number;
    failAction: 'continue' | 'warn' | 'block';
  };

  retrievalEvaluation: {
    enabled: boolean;
    timeout: number;
    severeThreshold: number;
    failAction: 'continue' | 'warn' | 'block';
  };

  answerEvaluation: {
    enabled: boolean;
    regenerationEnabled: boolean;
    timeout: number;
    majorFailureThreshold: number;
    failAction: 'continue' | 'warn' | 'block';
  };

  evaluators: {
    intentAnalyst: EvaluatorRoleConfig;
    coverageChecker: EvaluatorRoleConfig;
    faithfulnessJudge: EvaluatorRoleConfig;
    qualityAssessor: EvaluatorRoleConfig;
    factChecker: EvaluatorRoleConfig;
  };

  escalationModel: string;
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  enabled: true,

  planEvaluation: {
    enabled: true,
    iterationEnabled: true,
    maxAttempts: 3,
    timeout: 60000,
    passThreshold: 0.7,
    failAction: 'continue',
  },

  retrievalEvaluation: {
    enabled: true,
    timeout: 30000,
    severeThreshold: 0.5,
    failAction: 'continue',
  },

  answerEvaluation: {
    enabled: true,
    regenerationEnabled: true,
    timeout: 45000,
    majorFailureThreshold: 0.5,
    failAction: 'continue',
  },

  evaluators: {
    intentAnalyst: {
      model: 'llama3.1:8b',
      dimensions: ['intentAlignment', 'relevance'],
      promptTemplate: 'intent-analyst',
    },
    coverageChecker: {
      model: 'qwen3:14b',
      dimensions: ['queryCoverage', 'completeness', 'contextRecall'],
      promptTemplate: 'coverage-checker',
    },
    faithfulnessJudge: {
      model: 'llama3.1:8b',
      dimensions: ['faithfulness', 'contextPrecision'],
      promptTemplate: 'faithfulness-judge',
    },
    qualityAssessor: {
      model: 'qwen3:14b',
      dimensions: ['coherence', 'sourceQuality'],
      promptTemplate: 'quality-assessor',
    },
    factChecker: {
      model: 'qwen3:14b',
      dimensions: ['factualAccuracy'],
      promptTemplate: 'fact-checker',
    },
  },

  escalationModel: 'qwen3:30b',
};
```

**Step 4: Create index file**

```typescript
// src/evaluation/interfaces/index.ts
export * from './dimension-scores.interface';
export * from './evaluation-result.interface';
export * from './evaluator-config.interface';
```

**Step 5: Commit**

```bash
git add src/evaluation/interfaces/
git commit -m "feat(evaluation): add evaluation interfaces and config"
```

---

### Task 1.3: Create Evaluation Entity for Persistence

**Files:**
- Create: `src/evaluation/entities/evaluation-record.entity.ts`
- Modify: `src/evaluation/evaluation.module.ts`

**Step 1: Create the evaluation record entity**

```typescript
// src/evaluation/entities/evaluation-record.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('evaluation_records')
export class EvaluationRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  logId: string;

  @Column({ nullable: true })
  queryId: string;

  @CreateDateColumn()
  timestamp: Date;

  @Column()
  userQuery: string;

  @Column('jsonb')
  planEvaluation: {
    attempts: any[];
    finalScores: Record<string, number>;
    passed: boolean;
    totalIterations: number;
    escalatedToLargeModel: boolean;
  };

  @Column('jsonb', { nullable: true })
  retrievalEvaluation: {
    scores: Record<string, number>;
    passed: boolean;
    flaggedSevere: boolean;
    sourceDetails: any[];
  };

  @Column('jsonb', { nullable: true })
  answerEvaluation: {
    attempts: any[];
    finalScores: Record<string, number>;
    passed: boolean;
    regenerated: boolean;
  };

  @Column('float')
  overallScore: number;

  @Column({ default: false })
  evaluationSkipped: boolean;

  @Column({ nullable: true })
  skipReason: string;
}
```

**Step 2: Update module to import TypeORM**

```typescript
// src/evaluation/evaluation.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './services/evaluation.service';
import { EvaluationRecordEntity } from './entities/evaluation-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EvaluationRecordEntity])],
  controllers: [EvaluationController],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
```

**Step 3: Run migrations (if using migrations) or let TypeORM sync**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/evaluation/entities/
git add src/evaluation/evaluation.module.ts
git commit -m "feat(evaluation): add evaluation record entity"
```

---

### Task 1.4: Implement Fail-Safe Wrapper

**Files:**
- Modify: `src/evaluation/services/evaluation.service.ts`
- Create: `src/evaluation/services/evaluation.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// src/evaluation/services/evaluation.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EvaluationService } from './evaluation.service';
import { EvaluationRecordEntity } from '../entities/evaluation-record.entity';

describe('EvaluationService', () => {
  let service: EvaluationService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      save: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvaluationService,
        {
          provide: getRepositoryToken(EvaluationRecordEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<EvaluationService>(EvaluationService);
  });

  describe('evaluateWithFallback', () => {
    it('should return fallback when evaluation is disabled', async () => {
      const fallback = { passed: true, scores: {}, evaluationSkipped: true };

      // Disable evaluation
      service['config'] = { enabled: false } as any;

      const result = await service.evaluateWithFallback(
        async () => ({ passed: false, scores: { test: 0.5 }, evaluationSkipped: false }),
        fallback,
        'test-context'
      );

      expect(result).toEqual(fallback);
    });

    it('should return evaluation result when successful', async () => {
      const expected = { passed: true, scores: { test: 0.8 }, evaluationSkipped: false };

      const result = await service.evaluateWithFallback(
        async () => expected,
        { passed: true, scores: {}, evaluationSkipped: true },
        'test-context'
      );

      expect(result).toEqual(expected);
    });

    it('should return fallback with skipReason when evaluation throws', async () => {
      const fallback = { passed: true, scores: {}, evaluationSkipped: true };

      const result = await service.evaluateWithFallback(
        async () => { throw new Error('Model unavailable'); },
        fallback,
        'test-context'
      );

      expect(result.evaluationSkipped).toBe(true);
      expect(result.skipReason).toBe('Model unavailable');
    });

    it('should return fallback when evaluation times out', async () => {
      const fallback = { passed: true, scores: {}, evaluationSkipped: true };

      // Set a very short timeout
      service['config'] = { enabled: true, planEvaluation: { timeout: 10 } } as any;

      const result = await service.evaluateWithFallback(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { passed: false, scores: {}, evaluationSkipped: false };
        },
        fallback,
        'test-context'
      );

      expect(result.evaluationSkipped).toBe(true);
      expect(result.skipReason).toContain('timeout');
    }, 10000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPatterns="evaluation.service.spec"`
Expected: FAIL (methods not implemented)

**Step 3: Implement the fail-safe wrapper**

```typescript
// src/evaluation/services/evaluation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EvaluationRecordEntity } from '../entities/evaluation-record.entity';
import {
  EvaluationResult,
  EvaluationConfig,
  DEFAULT_EVALUATION_CONFIG,
} from '../interfaces';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  private config: EvaluationConfig = DEFAULT_EVALUATION_CONFIG;

  constructor(
    @InjectRepository(EvaluationRecordEntity)
    private evaluationRepository: Repository<EvaluationRecordEntity>,
  ) {}

  async evaluateWithFallback<T extends EvaluationResult>(
    evaluationFn: () => Promise<T>,
    fallback: T,
    context: string,
  ): Promise<T> {
    if (!this.config.enabled) {
      this.logger.debug(`Evaluation disabled, using fallback for ${context}`);
      return fallback;
    }

    const timeout = this.getTimeoutForContext(context);

    try {
      const result = await Promise.race([
        evaluationFn(),
        this.createTimeout<T>(timeout, context),
      ]);
      return result;
    } catch (error) {
      this.logger.warn(`Evaluation failed (${context}), continuing with fallback`, {
        error: error.message,
        context,
      });

      await this.persistEvaluationError(context, error);

      return {
        ...fallback,
        evaluationSkipped: true,
        skipReason: error.message,
      } as T;
    }
  }

  private getTimeoutForContext(context: string): number {
    if (context.includes('plan')) {
      return this.config.planEvaluation?.timeout || 60000;
    }
    if (context.includes('retrieval')) {
      return this.config.retrievalEvaluation?.timeout || 30000;
    }
    if (context.includes('answer')) {
      return this.config.answerEvaluation?.timeout || 45000;
    }
    return 60000;
  }

  private createTimeout<T>(ms: number, context: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Evaluation timeout (${ms}ms) for ${context}`)), ms);
    });
  }

  private async persistEvaluationError(context: string, error: Error): Promise<void> {
    try {
      this.logger.debug(`Persisting evaluation error for ${context}: ${error.message}`);
      // Will be implemented with full persistence later
    } catch (persistError) {
      this.logger.error(`Failed to persist evaluation error: ${persistError.message}`);
    }
  }

  // Placeholder methods for plan evaluation (to be implemented in Phase 2)
  async evaluatePlan(plan: any, query: string): Promise<EvaluationResult> {
    return this.evaluateWithFallback(
      async () => {
        this.logger.log('Plan evaluation not yet implemented');
        return { passed: true, scores: {}, confidence: 1, evaluationSkipped: true };
      },
      { passed: true, scores: {}, confidence: 1, evaluationSkipped: true },
      'plan-evaluation',
    );
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPatterns="evaluation.service.spec"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/evaluation/services/
git commit -m "feat(evaluation): implement fail-safe evaluation wrapper"
```

---

## Phase 2: Plan Evaluation

### Task 2.1: Create Evaluator Prompts

**Files:**
- Create: `src/evaluation/prompts/intent-analyst.prompt.ts`
- Create: `src/evaluation/prompts/coverage-checker.prompt.ts`
- Create: `src/evaluation/prompts/index.ts`

**Step 1: Create intent analyst prompt**

```typescript
// src/evaluation/prompts/intent-analyst.prompt.ts
export const INTENT_ANALYST_PROMPT = `You are an Intent Analyst evaluating whether a research plan correctly interprets the user's query.

## User Query
{query}

## Generated Plan
{plan}

## Evaluation Criteria

### Intent Alignment (0.0 - 1.0)
- 1.0: Plan perfectly captures user's intent, all aspects addressed
- 0.8: Plan captures main intent, minor aspects missing
- 0.6: Plan partially captures intent, some misunderstanding
- 0.4: Plan misses significant aspects of user's intent
- 0.2: Plan fundamentally misunderstands user's query
- 0.0: Plan is completely unrelated to user's query

## Your Task
1. Analyze what the user actually wants to know
2. Compare against what the plan will investigate
3. Identify any misalignments or missing aspects
4. Provide a score and detailed critique

## Response Format (JSON)
{
  "scores": {
    "intentAlignment": <0.0-1.0>
  },
  "confidence": <0.0-1.0>,
  "critique": "<detailed explanation of score>",
  "misalignments": ["<list of specific issues>"],
  "suggestions": ["<how to improve>"]
}

Respond ONLY with valid JSON.`;
```

**Step 2: Create coverage checker prompt**

```typescript
// src/evaluation/prompts/coverage-checker.prompt.ts
export const COVERAGE_CHECKER_PROMPT = `You are a Coverage Checker evaluating whether search queries in a research plan cover all aspects of the user's question.

## User Query
{query}

## Generated Search Queries
{searchQueries}

## Evaluation Criteria

### Query Coverage (0.0 - 1.0)
- 1.0: All aspects of user's question covered by search queries
- 0.8: Most aspects covered, minor gaps
- 0.6: Main aspects covered, some significant gaps
- 0.4: Only basic aspects covered, major gaps
- 0.2: Minimal coverage, most aspects missing
- 0.0: Search queries don't address the question

### Scope Appropriateness (0.0 - 1.0)
- 1.0: Perfect scope - focused yet comprehensive
- 0.8: Good scope, slightly narrow or broad
- 0.6: Scope issues - either too narrow or too broad
- 0.4: Significant scope problems
- 0.2: Scope fundamentally wrong
- 0.0: Completely inappropriate scope

## Your Task
1. Identify all aspects/angles in the user's query
2. Map which search queries cover which aspects
3. Find gaps (uncovered aspects) and overlaps (redundancy)
4. Assess if scope is appropriate for the query

## Response Format (JSON)
{
  "scores": {
    "queryCoverage": <0.0-1.0>,
    "scopeAppropriateness": <0.0-1.0>
  },
  "confidence": <0.0-1.0>,
  "critique": "<detailed explanation>",
  "coveredAspects": ["<list>"],
  "missingAspects": ["<list>"],
  "scopeIssues": "<narrow|broad|appropriate>"
}

Respond ONLY with valid JSON.`;
```

**Step 3: Create index file**

```typescript
// src/evaluation/prompts/index.ts
export * from './intent-analyst.prompt';
export * from './coverage-checker.prompt';
```

**Step 4: Commit**

```bash
git add src/evaluation/prompts/
git commit -m "feat(evaluation): add evaluator prompt templates"
```

---

### Task 2.2: Create Panel Evaluator Service

**Files:**
- Create: `src/evaluation/services/panel-evaluator.service.ts`
- Create: `src/evaluation/services/panel-evaluator.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// src/evaluation/services/panel-evaluator.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PanelEvaluatorService } from './panel-evaluator.service';
import { OllamaService } from '../../llm/ollama.service';

describe('PanelEvaluatorService', () => {
  let service: PanelEvaluatorService;
  let mockOllamaService: any;

  beforeEach(async () => {
    mockOllamaService = {
      chat: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PanelEvaluatorService,
        {
          provide: OllamaService,
          useValue: mockOllamaService,
        },
      ],
    }).compile();

    service = module.get<PanelEvaluatorService>(PanelEvaluatorService);
  });

  describe('evaluateWithRole', () => {
    it('should call LLM and parse JSON response', async () => {
      const mockResponse = {
        message: {
          content: JSON.stringify({
            scores: { intentAlignment: 0.85 },
            confidence: 0.9,
            critique: 'Good alignment',
          }),
        },
      };
      mockOllamaService.chat.mockResolvedValue(mockResponse);

      const result = await service.evaluateWithRole(
        'intentAnalyst',
        { query: 'test query', plan: {} },
      );

      expect(result.scores.intentAlignment).toBe(0.85);
      expect(result.confidence).toBe(0.9);
      expect(result.role).toBe('intentAnalyst');
    });

    it('should return low confidence on parse error', async () => {
      mockOllamaService.chat.mockResolvedValue({
        message: { content: 'not valid json' },
      });

      const result = await service.evaluateWithRole(
        'intentAnalyst',
        { query: 'test', plan: {} },
      );

      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('evaluateWithPanel', () => {
    it('should run multiple evaluators in parallel', async () => {
      mockOllamaService.chat.mockResolvedValue({
        message: {
          content: JSON.stringify({
            scores: { test: 0.8 },
            confidence: 0.9,
            critique: 'Good',
          }),
        },
      });

      const results = await service.evaluateWithPanel(
        ['intentAnalyst', 'coverageChecker'],
        { query: 'test', plan: {} },
      );

      expect(results).toHaveLength(2);
      expect(mockOllamaService.chat).toHaveBeenCalledTimes(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPatterns="panel-evaluator.service.spec"`
Expected: FAIL

**Step 3: Implement panel evaluator service**

```typescript
// src/evaluation/services/panel-evaluator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OllamaService } from '../../llm/ollama.service';
import { EvaluatorResult, DEFAULT_EVALUATION_CONFIG } from '../interfaces';
import { INTENT_ANALYST_PROMPT, COVERAGE_CHECKER_PROMPT } from '../prompts';

type EvaluatorRole = 'intentAnalyst' | 'coverageChecker' | 'faithfulnessJudge' | 'qualityAssessor' | 'factChecker';

@Injectable()
export class PanelEvaluatorService {
  private readonly logger = new Logger(PanelEvaluatorService.name);
  private readonly config = DEFAULT_EVALUATION_CONFIG;

  private readonly prompts: Record<EvaluatorRole, string> = {
    intentAnalyst: INTENT_ANALYST_PROMPT,
    coverageChecker: COVERAGE_CHECKER_PROMPT,
    faithfulnessJudge: '', // To be added
    qualityAssessor: '', // To be added
    factChecker: '', // To be added
  };

  constructor(private readonly ollamaService: OllamaService) {}

  async evaluateWithRole(
    role: EvaluatorRole,
    context: { query: string; plan: any; searchQueries?: string[] },
  ): Promise<EvaluatorResult> {
    const startTime = Date.now();
    const roleConfig = this.config.evaluators[role];
    const model = roleConfig.model;

    try {
      const prompt = this.buildPrompt(role, context);

      const response = await this.ollamaService.chat(
        [{ role: 'user', content: prompt }],
        [],
        model,
      );

      const content = response.message.content;
      const parsed = this.parseResponse(content);

      return {
        role,
        model,
        dimensions: roleConfig.dimensions,
        scores: parsed.scores || {},
        confidence: parsed.confidence || 0.5,
        critique: parsed.critique || '',
        rawResponse: content,
        latency: Date.now() - startTime,
        tokensUsed: 0, // Would need token counting
      };
    } catch (error) {
      this.logger.error(`Evaluator ${role} failed: ${error.message}`);
      return {
        role,
        model,
        dimensions: roleConfig.dimensions,
        scores: {},
        confidence: 0.1,
        critique: `Evaluation failed: ${error.message}`,
        rawResponse: '',
        latency: Date.now() - startTime,
        tokensUsed: 0,
      };
    }
  }

  async evaluateWithPanel(
    roles: EvaluatorRole[],
    context: { query: string; plan: any; searchQueries?: string[] },
  ): Promise<EvaluatorResult[]> {
    const evaluations = roles.map(role => this.evaluateWithRole(role, context));
    return Promise.all(evaluations);
  }

  private buildPrompt(
    role: EvaluatorRole,
    context: { query: string; plan: any; searchQueries?: string[] },
  ): string {
    let template = this.prompts[role];

    template = template.replace('{query}', context.query);
    template = template.replace('{plan}', JSON.stringify(context.plan, null, 2));

    if (context.searchQueries) {
      template = template.replace('{searchQueries}', context.searchQueries.join('\n'));
    }

    return template;
  }

  private parseResponse(content: string): any {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { confidence: 0.3, critique: 'Could not parse response' };
    } catch {
      return { confidence: 0.3, critique: 'Invalid JSON response' };
    }
  }
}
```

**Step 4: Run tests**

Run: `npm test -- --testPathPatterns="panel-evaluator.service.spec"`
Expected: PASS

**Step 5: Update evaluation module**

Add PanelEvaluatorService to providers in evaluation.module.ts

**Step 6: Commit**

```bash
git add src/evaluation/services/panel-evaluator*
git add src/evaluation/evaluation.module.ts
git commit -m "feat(evaluation): implement panel evaluator service"
```

---

### Task 2.3: Create Score Aggregator Service

**Files:**
- Create: `src/evaluation/services/score-aggregator.service.ts`
- Create: `src/evaluation/services/score-aggregator.service.spec.ts`

**Step 1: Write the failing test**

```typescript
// src/evaluation/services/score-aggregator.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ScoreAggregatorService } from './score-aggregator.service';

describe('ScoreAggregatorService', () => {
  let service: ScoreAggregatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoreAggregatorService],
    }).compile();

    service = module.get<ScoreAggregatorService>(ScoreAggregatorService);
  });

  describe('aggregateScores', () => {
    it('should weight scores by confidence', () => {
      const results = [
        {
          role: 'intentAnalyst',
          scores: { intentAlignment: 0.8 },
          confidence: 0.9,
        },
        {
          role: 'coverageChecker',
          scores: { queryCoverage: 0.6 },
          confidence: 0.5,
        },
      ];

      const aggregated = service.aggregateScores(results as any);

      // Higher confidence should have more weight
      expect(aggregated.scores.intentAlignment).toBeCloseTo(0.8);
      expect(aggregated.scores.queryCoverage).toBeCloseTo(0.6);
    });

    it('should calculate overall confidence', () => {
      const results = [
        { scores: { a: 0.8 }, confidence: 0.9 },
        { scores: { b: 0.7 }, confidence: 0.7 },
      ];

      const aggregated = service.aggregateScores(results as any);

      expect(aggregated.confidence).toBeGreaterThan(0.7);
      expect(aggregated.confidence).toBeLessThan(1.0);
    });
  });

  describe('checkEscalationTriggers', () => {
    it('should trigger on low confidence', () => {
      const result = {
        scores: { test: 0.7 },
        confidence: 0.4,
      };

      const trigger = service.checkEscalationTriggers(result, [
        { confidence: 0.4 },
        { confidence: 0.5 },
      ] as any);

      expect(trigger).toBe('low_confidence');
    });

    it('should trigger on high disagreement', () => {
      const result = { scores: { test: 0.7 }, confidence: 0.8 };

      const trigger = service.checkEscalationTriggers(result, [
        { scores: { test: 0.9 }, confidence: 0.8 },
        { scores: { test: 0.4 }, confidence: 0.8 },
      ] as any);

      expect(trigger).toBe('disagreement');
    });

    it('should trigger on borderline score', () => {
      const result = { scores: { test: 0.68 }, confidence: 0.8 };

      const trigger = service.checkEscalationTriggers(result, [], 0.7);

      expect(trigger).toBe('borderline');
    });

    it('should return null when no trigger', () => {
      const result = { scores: { test: 0.9 }, confidence: 0.9 };

      const trigger = service.checkEscalationTriggers(result, [
        { scores: { test: 0.85 }, confidence: 0.9 },
      ] as any, 0.7);

      expect(trigger).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPatterns="score-aggregator.service.spec"`
Expected: FAIL

**Step 3: Implement score aggregator**

```typescript
// src/evaluation/services/score-aggregator.service.ts
import { Injectable } from '@nestjs/common';
import { EvaluatorResult, DimensionScores } from '../interfaces';

export interface AggregatedResult {
  scores: DimensionScores;
  confidence: number;
}

@Injectable()
export class ScoreAggregatorService {
  private readonly PLAN_DIMENSION_WEIGHTS: Record<string, number> = {
    intentAlignment: 0.50,
    queryCoverage: 0.35,
    scopeAppropriateness: 0.15,
  };

  aggregateScores(results: EvaluatorResult[]): AggregatedResult {
    const scores: DimensionScores = {};
    let totalConfidence = 0;
    let confidenceCount = 0;

    // Collect all scores with confidence weighting
    for (const result of results) {
      for (const [dimension, score] of Object.entries(result.scores)) {
        if (typeof score === 'number') {
          // Weight by confidence
          scores[dimension] = score; // For now, just take the value
        }
      }
      totalConfidence += result.confidence;
      confidenceCount++;
    }

    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return {
      scores,
      confidence: avgConfidence,
    };
  }

  calculateOverallScore(scores: DimensionScores, weights?: Record<string, number>): number {
    const w = weights || this.PLAN_DIMENSION_WEIGHTS;
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [dimension, weight] of Object.entries(w)) {
      if (dimension in scores) {
        weightedSum += scores[dimension] * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  checkEscalationTriggers(
    aggregated: AggregatedResult,
    results: EvaluatorResult[],
    passThreshold: number = 0.7,
  ): 'low_confidence' | 'disagreement' | 'borderline' | null {
    // Check low confidence
    const allLowConfidence = results.length > 0 &&
      results.every(r => r.confidence < 0.6);
    if (allLowConfidence || aggregated.confidence < 0.6) {
      return 'low_confidence';
    }

    // Check disagreement (scores differ by > 0.3)
    for (const dimension of Object.keys(aggregated.scores)) {
      const dimensionScores = results
        .map(r => r.scores[dimension])
        .filter(s => typeof s === 'number');

      if (dimensionScores.length >= 2) {
        const max = Math.max(...dimensionScores);
        const min = Math.min(...dimensionScores);
        if (max - min > 0.3) {
          return 'disagreement';
        }
      }
    }

    // Check borderline (within 0.05 of threshold)
    const overallScore = this.calculateOverallScore(aggregated.scores);
    if (Math.abs(overallScore - passThreshold) < 0.05) {
      return 'borderline';
    }

    return null;
  }
}
```

**Step 4: Run tests**

Run: `npm test -- --testPathPatterns="score-aggregator.service.spec"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/evaluation/services/score-aggregator*
git commit -m "feat(evaluation): implement score aggregator with confidence weighting"
```

---

## Phase 3-7: Continue Implementation

The remaining phases follow the same pattern:

- **Phase 3**: Retrieval & Answer Evaluation services
- **Phase 4**: Escalation Handler service
- **Phase 5**: Runtime UI components (Angular)
- **Phase 6**: Offline Dashboard (Angular)
- **Phase 7**: Integration testing and polish

Each task includes:
1. Write failing test
2. Verify test fails
3. Write minimal implementation
4. Verify test passes
5. Commit

---

## Integration Checklist

After implementing all phases:

- [ ] All unit tests pass (`npm test`)
- [ ] Integration tests pass
- [ ] App builds (`npm run build`)
- [ ] App starts (`npm run start:dev`)
- [ ] Evaluation endpoint responds (`GET /api/evaluation/health`)
- [ ] Research query includes evaluation scores
- [ ] Evaluation can be disabled via config
- [ ] Failed evaluation doesn't block research
- [ ] Evaluation data persisted to database
- [ ] Angular UI shows evaluation scores

---

## Notes for Implementation

1. **Start with Phase 1-2** - These establish the foundation
2. **Test each service in isolation** before integrating
3. **Keep evaluation disabled by default** during development
4. **Use small models first** (llama3.1:8b) for faster iteration
5. **Commit frequently** - Each task should be one commit
