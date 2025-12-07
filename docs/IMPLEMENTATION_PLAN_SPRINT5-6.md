# Sprint 5-6 Implementation Plan: Fact-Checking, Model Comparison & UI Enhancement

**Document Version**: 1.0
**Created**: December 4, 2025
**Sprint Duration**: 3 weeks
**Expected Completion**: December 25, 2025

---

## Executive Summary

### Sprint Goals
This sprint focuses on three key areas:
1. **Fact-Checker Agent** (P0): Adversarial verification layer to validate synthesized answers
2. **Model Comparison Framework** (P0): A/B testing infrastructure for evaluating new LLM models
3. **Confidence UI** (P1): Visual representation of confidence scores and source attribution

### Expected Impact
| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Hallucination Rate | ~15% | <5% | 66% reduction |
| User Trust | Moderate | High | Confidence visibility |
| Model Evaluation Time | Manual | Automated | 90% reduction |
| Answer Accuracy | 85% | 95% | +10% |

### Research Basis
- **LLM-as-Judge**: Using LLMs to evaluate other LLM outputs (Zheng et al., 2023)
- **Self-Consistency**: Multiple generation paths for answer verification
- **A/B Testing for ML**: Systematic model comparison methodologies

---

## Architecture Overview

### System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Research Agent System                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────────────────┐   │
│  │   Frontend   │───▶│  Research API    │───▶│     Orchestrator        │   │
│  │              │    │                  │    │                         │   │
│  │ ┌──────────┐ │    │  /research       │    │  ┌───────────────────┐  │   │
│  │ │Confidence│ │    │  /compare        │    │  │ Model Comparison  │  │   │
│  │ │   UI     │ │    │  /models         │    │  │    Coordinator    │  │   │
│  │ └──────────┘ │    └──────────────────┘    │  └───────────────────┘  │   │
│  │              │                            │           │              │   │
│  │ ┌──────────┐ │                            │  ┌───────┴───────┐      │   │
│  │ │Comparison│ │                            │  │               │      │   │
│  │ │  View    │ │                            │  ▼               ▼      │   │
│  │ └──────────┘ │                            │ Model A       Model B   │   │
│  └──────────────┘                            │ Pipeline      Pipeline  │   │
│                                              │     │             │     │   │
│                                              │     ▼             ▼     │   │
│                                              │  ┌─────────────────┐   │   │
│                                              │  │  Fact-Checker   │   │   │
│                                              │  │     Agent       │   │   │
│                                              │  └─────────────────┘   │   │
│                                              └─────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Integration Points
- **OllamaService**: Extended to support multiple model configurations
- **OrchestratorService**: New comparison mode execution path
- **EvaluationService**: Extended comparison metrics
- **Frontend**: New comparison view and confidence visualization components

---

## Phase 11: Model Comparison Framework

### Overview
Enable side-by-side execution and comparison of research queries using different LLM models. This feature allows systematic evaluation of new models (e.g., new Mistral releases) against the current baseline.

**Default State**: DISABLED (opt-in per request)

### Task 11.1.1: Model Configuration Service

**Priority**: P0 (Critical)
**Effort**: 8 hours
**Dependencies**: None

**Files to Create**:
- `src/llm/interfaces/model-config.interface.ts`
- `src/llm/services/model-configuration.service.ts`
- `src/llm/services/model-configuration.service.spec.ts`

**Implementation Details**:

```typescript
// src/llm/interfaces/model-config.interface.ts

export interface ModelConfig {
  id: string;                    // Unique identifier (e.g., 'mistral-nemo', 'mistral-large-2')
  name: string;                  // Display name
  provider: 'ollama' | 'openai' | 'anthropic' | 'mistral';
  modelName: string;             // Provider-specific model name
  endpoint?: string;             // Custom endpoint if needed
  contextWindow: number;         // Max context tokens
  capabilities: ModelCapabilities;
  isDefault: boolean;            // Is this the default model?
  isEnabled: boolean;            // Is this model available for use?
  addedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ModelCapabilities {
  supportsToolCalls: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
  maxOutputTokens: number;
  costPerMillionTokens?: {
    input: number;
    output: number;
  };
}

export interface ModelRegistry {
  models: ModelConfig[];
  defaultModelId: string;
  comparisonEnabled: boolean;
}
```

```typescript
// src/llm/services/model-configuration.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelConfig, ModelRegistry } from '../interfaces/model-config.interface';

@Injectable()
export class ModelConfigurationService {
  private registry: ModelRegistry;

  constructor(private readonly configService: ConfigService) {
    this.initializeRegistry();
  }

  private initializeRegistry(): void {
    console.log('[ModelConfigurationService] Initializing model registry');

    this.registry = {
      models: this.loadModelsFromConfig(),
      defaultModelId: this.configService.get('DEFAULT_MODEL_ID', 'mistral-nemo'),
      comparisonEnabled: this.configService.get('MODEL_COMPARISON_ENABLED', false),
    };

    console.log(`[ModelConfigurationService] Registry initialized with ${this.registry.models.length} models`);
  }

  private loadModelsFromConfig(): ModelConfig[] {
    // Load from environment or database
    return [
      {
        id: 'mistral-nemo',
        name: 'Mistral Nemo',
        provider: 'ollama',
        modelName: 'mistral-nemo',
        contextWindow: 128000,
        capabilities: {
          supportsToolCalls: true,
          supportsStreaming: true,
          supportsVision: false,
          maxOutputTokens: 8192,
        },
        isDefault: true,
        isEnabled: true,
        addedAt: new Date(),
      },
      // Additional models loaded dynamically
    ];
  }

  getDefaultModel(): ModelConfig {
    return this.registry.models.find(m => m.id === this.registry.defaultModelId)!;
  }

  getModelById(id: string): ModelConfig | undefined {
    return this.registry.models.find(m => m.id === id);
  }

  getEnabledModels(): ModelConfig[] {
    return this.registry.models.filter(m => m.isEnabled);
  }

  async addModel(config: Omit<ModelConfig, 'id' | 'addedAt'>): Promise<ModelConfig> {
    console.log(`[ModelConfigurationService] Adding new model: ${config.name}`);

    const newModel: ModelConfig = {
      ...config,
      id: this.generateModelId(config.name),
      addedAt: new Date(),
    };

    this.registry.models.push(newModel);
    console.log(`[ModelConfigurationService] Model added with ID: ${newModel.id}`);

    return newModel;
  }

  async setDefaultModel(modelId: string): Promise<void> {
    console.log(`[ModelConfigurationService] Setting default model to: ${modelId}`);

    const model = this.getModelById(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // Update previous default
    this.registry.models.forEach(m => m.isDefault = false);
    model.isDefault = true;
    this.registry.defaultModelId = modelId;

    console.log(`[ModelConfigurationService] Default model updated to: ${modelId}`);
  }

  isComparisonEnabled(): boolean {
    return this.registry.comparisonEnabled;
  }

  private generateModelId(name: string): string {
    return `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
  }
}
```

**Acceptance Criteria**:
- [ ] ModelConfig interface supports multiple providers
- [ ] Registry loads models from configuration
- [ ] Default model can be changed at runtime
- [ ] Models can be enabled/disabled
- [ ] Comprehensive logging for all operations
- [ ] Unit tests with >90% coverage

---

### Task 11.1.2: Comparison Coordinator Service

**Priority**: P0 (Critical)
**Effort**: 12 hours
**Dependencies**: Task 11.1.1

**Files to Create**:
- `src/comparison/interfaces/comparison.interface.ts`
- `src/comparison/services/comparison-coordinator.service.ts`
- `src/comparison/services/comparison-coordinator.service.spec.ts`
- `src/comparison/comparison.module.ts`

**Implementation Details**:

```typescript
// src/comparison/interfaces/comparison.interface.ts

export interface ComparisonRequest {
  query: string;
  modelAId: string;           // Primary model (usually current default)
  modelBId: string;           // Challenger model (new model being evaluated)
  options?: ComparisonOptions;
}

export interface ComparisonOptions {
  runInParallel: boolean;     // Run both models simultaneously (default: true)
  includeMetrics: boolean;    // Include detailed metrics (default: true)
  evaluateQuality: boolean;   // Run quality evaluation on both (default: true)
  timeout?: number;           // Max time per model in ms
}

export interface ComparisonResult {
  id: string;
  query: string;
  timestamp: Date;
  modelA: ModelExecutionResult;
  modelB: ModelExecutionResult;
  comparison: ComparisonAnalysis;
  metadata: ComparisonMetadata;
}

export interface ModelExecutionResult {
  modelId: string;
  modelName: string;
  answer: string;
  sources: Source[];
  confidence: ConfidenceResult;
  metrics: ExecutionMetrics;
  phases: PhaseResult[];
  error?: string;
}

export interface ExecutionMetrics {
  totalDurationMs: number;
  planningDurationMs: number;
  retrievalDurationMs: number;
  synthesisDurationMs: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  retrievalCycles: number;
  sourcesFound: number;
}

export interface ComparisonAnalysis {
  winner: 'modelA' | 'modelB' | 'tie';
  winnerReason: string;
  scores: {
    modelA: ComparisonScores;
    modelB: ComparisonScores;
  };
  differences: ComparisonDifference[];
  recommendation: string;
}

export interface ComparisonScores {
  overall: number;            // 0-100
  answerQuality: number;      // Completeness, accuracy
  sourceUsage: number;        // Citation quality
  confidence: number;         // Self-assessed confidence
  speed: number;              // Execution speed (normalized)
  tokenEfficiency: number;    // Quality per token
}

export interface ComparisonDifference {
  aspect: string;
  modelAValue: string | number;
  modelBValue: string | number;
  winner: 'modelA' | 'modelB' | 'tie';
  significance: 'high' | 'medium' | 'low';
}

export interface ComparisonMetadata {
  requestedBy?: string;
  purpose?: string;           // e.g., 'new_model_evaluation', 'regression_test'
  tags?: string[];
}
```

```typescript
// src/comparison/services/comparison-coordinator.service.ts

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { OrchestratorService } from '../../orchestration/orchestrator.service';
import { ModelConfigurationService } from '../../llm/services/model-configuration.service';
import { EvaluationService } from '../../evaluation/services/evaluation.service';
import {
  ComparisonRequest,
  ComparisonResult,
  ModelExecutionResult,
  ComparisonAnalysis,
  ComparisonScores,
} from '../interfaces/comparison.interface';

@Injectable()
export class ComparisonCoordinatorService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly modelConfig: ModelConfigurationService,
    private readonly evaluation: EvaluationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async executeComparison(request: ComparisonRequest): Promise<ComparisonResult> {
    const comparisonId = randomUUID();
    console.log(`[ComparisonCoordinator] Starting comparison ${comparisonId}`);
    console.log(`[ComparisonCoordinator] Query: "${request.query}"`);
    console.log(`[ComparisonCoordinator] Model A: ${request.modelAId}, Model B: ${request.modelBId}`);

    // Validate models exist
    const modelA = this.modelConfig.getModelById(request.modelAId);
    const modelB = this.modelConfig.getModelById(request.modelBId);

    if (!modelA || !modelB) {
      throw new Error(`Invalid model configuration: ${!modelA ? request.modelAId : request.modelBId} not found`);
    }

    // Emit comparison started event
    this.eventEmitter.emit('comparison.started', {
      comparisonId,
      query: request.query,
      modelA: modelA.name,
      modelB: modelB.name,
      timestamp: new Date(),
    });

    const options = {
      runInParallel: true,
      includeMetrics: true,
      evaluateQuality: true,
      ...request.options,
    };

    let resultA: ModelExecutionResult;
    let resultB: ModelExecutionResult;

    if (options.runInParallel) {
      console.log(`[ComparisonCoordinator] Executing models in parallel`);
      [resultA, resultB] = await Promise.all([
        this.executeWithModel(comparisonId, request.query, modelA, 'A'),
        this.executeWithModel(comparisonId, request.query, modelB, 'B'),
      ]);
    } else {
      console.log(`[ComparisonCoordinator] Executing models sequentially`);
      resultA = await this.executeWithModel(comparisonId, request.query, modelA, 'A');
      resultB = await this.executeWithModel(comparisonId, request.query, modelB, 'B');
    }

    console.log(`[ComparisonCoordinator] Both models completed, analyzing results`);

    // Analyze and compare results
    const comparison = await this.analyzeComparison(resultA, resultB, request.query);

    const result: ComparisonResult = {
      id: comparisonId,
      query: request.query,
      timestamp: new Date(),
      modelA: resultA,
      modelB: resultB,
      comparison,
      metadata: request.options as any || {},
    };

    // Emit completion event
    this.eventEmitter.emit('comparison.completed', {
      comparisonId,
      winner: comparison.winner,
      recommendation: comparison.recommendation,
      timestamp: new Date(),
    });

    console.log(`[ComparisonCoordinator] Comparison ${comparisonId} completed`);
    console.log(`[ComparisonCoordinator] Winner: ${comparison.winner}`);

    return result;
  }

  private async executeWithModel(
    comparisonId: string,
    query: string,
    model: ModelConfig,
    label: string,
  ): Promise<ModelExecutionResult> {
    const logId = `${comparisonId}-model${label}`;
    console.log(`[ComparisonCoordinator] Starting Model ${label} (${model.name}) execution`);

    const startTime = Date.now();

    try {
      // Emit model execution started
      this.eventEmitter.emit('comparison.model.started', {
        comparisonId,
        modelLabel: label,
        modelId: model.id,
        modelName: model.name,
        timestamp: new Date(),
      });

      // Execute research with specific model
      const result = await this.orchestrator.executeResearchWithModel(
        query,
        logId,
        model.id,
      );

      const durationMs = Date.now() - startTime;
      console.log(`[ComparisonCoordinator] Model ${label} completed in ${durationMs}ms`);

      // Emit model execution completed
      this.eventEmitter.emit('comparison.model.completed', {
        comparisonId,
        modelLabel: label,
        modelId: model.id,
        durationMs,
        timestamp: new Date(),
      });

      return {
        modelId: model.id,
        modelName: model.name,
        answer: result.answer,
        sources: result.sources,
        confidence: result.confidence,
        metrics: {
          totalDurationMs: durationMs,
          planningDurationMs: result.metadata?.planningDurationMs || 0,
          retrievalDurationMs: result.metadata?.retrievalDurationMs || 0,
          synthesisDurationMs: result.metadata?.synthesisDurationMs || 0,
          tokenUsage: result.metadata?.tokenUsage || { input: 0, output: 0, total: 0 },
          retrievalCycles: result.metadata?.retrievalCycles || 1,
          sourcesFound: result.sources?.length || 0,
        },
        phases: result.phases || [],
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[ComparisonCoordinator] Model ${label} failed:`, error.message);

      // Emit model execution failed
      this.eventEmitter.emit('comparison.model.failed', {
        comparisonId,
        modelLabel: label,
        modelId: model.id,
        error: error.message,
        timestamp: new Date(),
      });

      return {
        modelId: model.id,
        modelName: model.name,
        answer: '',
        sources: [],
        confidence: { overallConfidence: 0 } as any,
        metrics: {
          totalDurationMs: durationMs,
          planningDurationMs: 0,
          retrievalDurationMs: 0,
          synthesisDurationMs: 0,
          tokenUsage: { input: 0, output: 0, total: 0 },
          retrievalCycles: 0,
          sourcesFound: 0,
        },
        phases: [],
        error: error.message,
      };
    }
  }

  private async analyzeComparison(
    resultA: ModelExecutionResult,
    resultB: ModelExecutionResult,
    query: string,
  ): Promise<ComparisonAnalysis> {
    console.log(`[ComparisonCoordinator] Analyzing comparison results`);

    // Calculate scores for each model
    const scoresA = this.calculateScores(resultA);
    const scoresB = this.calculateScores(resultB);

    // Determine winner
    const winner = this.determineWinner(scoresA, scoresB);

    // Identify key differences
    const differences = this.identifyDifferences(resultA, resultB, scoresA, scoresB);

    // Generate recommendation
    const recommendation = this.generateRecommendation(winner, scoresA, scoresB, differences);

    console.log(`[ComparisonCoordinator] Analysis complete - Winner: ${winner}`);

    return {
      winner,
      winnerReason: this.getWinnerReason(winner, scoresA, scoresB),
      scores: {
        modelA: scoresA,
        modelB: scoresB,
      },
      differences,
      recommendation,
    };
  }

  private calculateScores(result: ModelExecutionResult): ComparisonScores {
    // Handle error case
    if (result.error) {
      return {
        overall: 0,
        answerQuality: 0,
        sourceUsage: 0,
        confidence: 0,
        speed: 0,
        tokenEfficiency: 0,
      };
    }

    const answerQuality = this.calculateAnswerQuality(result);
    const sourceUsage = this.calculateSourceUsage(result);
    const confidence = result.confidence?.overallConfidence || 0;
    const speed = this.normalizeSpeed(result.metrics.totalDurationMs);
    const tokenEfficiency = this.calculateTokenEfficiency(result);

    const overall = (
      answerQuality * 0.35 +
      sourceUsage * 0.20 +
      confidence * 0.25 +
      speed * 0.10 +
      tokenEfficiency * 0.10
    );

    return {
      overall: Math.round(overall * 100) / 100,
      answerQuality: Math.round(answerQuality * 100) / 100,
      sourceUsage: Math.round(sourceUsage * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      speed: Math.round(speed * 100) / 100,
      tokenEfficiency: Math.round(tokenEfficiency * 100) / 100,
    };
  }

  private calculateAnswerQuality(result: ModelExecutionResult): number {
    // Based on answer length, structure, and confidence
    const hasAnswer = result.answer && result.answer.length > 100;
    const hasStructure = result.answer.includes('\n') || result.answer.includes('- ');
    const baseQuality = hasAnswer ? 0.6 : 0;
    const structureBonus = hasStructure ? 0.2 : 0;
    const confidenceBonus = (result.confidence?.overallConfidence || 0) * 0.2;

    return Math.min(1, baseQuality + structureBonus + confidenceBonus);
  }

  private calculateSourceUsage(result: ModelExecutionResult): number {
    const sourceCount = result.sources?.length || 0;
    // Normalize: 0 sources = 0, 5+ sources = 1
    return Math.min(1, sourceCount / 5);
  }

  private normalizeSpeed(durationMs: number): number {
    // Normalize: <30s = 1.0, >120s = 0.0
    const maxAcceptable = 120000;
    const minAcceptable = 30000;

    if (durationMs <= minAcceptable) return 1;
    if (durationMs >= maxAcceptable) return 0;

    return 1 - ((durationMs - minAcceptable) / (maxAcceptable - minAcceptable));
  }

  private calculateTokenEfficiency(result: ModelExecutionResult): number {
    const tokens = result.metrics.tokenUsage.total;
    const quality = this.calculateAnswerQuality(result);

    if (tokens === 0) return 0;

    // Quality per 10k tokens, normalized
    const efficiency = (quality * 10000) / tokens;
    return Math.min(1, efficiency);
  }

  private determineWinner(
    scoresA: ComparisonScores,
    scoresB: ComparisonScores,
  ): 'modelA' | 'modelB' | 'tie' {
    const diff = scoresA.overall - scoresB.overall;

    // Require >5% difference to declare winner
    if (Math.abs(diff) < 0.05) return 'tie';
    return diff > 0 ? 'modelA' : 'modelB';
  }

  private getWinnerReason(
    winner: 'modelA' | 'modelB' | 'tie',
    scoresA: ComparisonScores,
    scoresB: ComparisonScores,
  ): string {
    if (winner === 'tie') {
      return 'Both models performed similarly with no significant difference in overall quality.';
    }

    const winnerScores = winner === 'modelA' ? scoresA : scoresB;
    const loserScores = winner === 'modelA' ? scoresB : scoresA;

    const advantages: string[] = [];
    if (winnerScores.answerQuality > loserScores.answerQuality + 0.1) {
      advantages.push('higher answer quality');
    }
    if (winnerScores.sourceUsage > loserScores.sourceUsage + 0.1) {
      advantages.push('better source usage');
    }
    if (winnerScores.confidence > loserScores.confidence + 0.1) {
      advantages.push('higher confidence');
    }
    if (winnerScores.speed > loserScores.speed + 0.1) {
      advantages.push('faster execution');
    }

    return advantages.length > 0
      ? `Winner demonstrated ${advantages.join(', ')}.`
      : `Winner had a higher overall score (${winnerScores.overall} vs ${loserScores.overall}).`;
  }

  private identifyDifferences(
    resultA: ModelExecutionResult,
    resultB: ModelExecutionResult,
    scoresA: ComparisonScores,
    scoresB: ComparisonScores,
  ): ComparisonDifference[] {
    const differences: ComparisonDifference[] = [];

    // Duration difference
    differences.push({
      aspect: 'Execution Time',
      modelAValue: `${(resultA.metrics.totalDurationMs / 1000).toFixed(1)}s`,
      modelBValue: `${(resultB.metrics.totalDurationMs / 1000).toFixed(1)}s`,
      winner: resultA.metrics.totalDurationMs < resultB.metrics.totalDurationMs ? 'modelA' : 'modelB',
      significance: Math.abs(resultA.metrics.totalDurationMs - resultB.metrics.totalDurationMs) > 30000 ? 'high' : 'medium',
    });

    // Token usage
    differences.push({
      aspect: 'Token Usage',
      modelAValue: resultA.metrics.tokenUsage.total,
      modelBValue: resultB.metrics.tokenUsage.total,
      winner: resultA.metrics.tokenUsage.total < resultB.metrics.tokenUsage.total ? 'modelA' : 'modelB',
      significance: 'medium',
    });

    // Source count
    differences.push({
      aspect: 'Sources Found',
      modelAValue: resultA.metrics.sourcesFound,
      modelBValue: resultB.metrics.sourcesFound,
      winner: resultA.metrics.sourcesFound > resultB.metrics.sourcesFound ? 'modelA' : 'modelB',
      significance: 'medium',
    });

    // Confidence
    differences.push({
      aspect: 'Confidence Score',
      modelAValue: `${(scoresA.confidence * 100).toFixed(0)}%`,
      modelBValue: `${(scoresB.confidence * 100).toFixed(0)}%`,
      winner: scoresA.confidence > scoresB.confidence ? 'modelA' : 'modelB',
      significance: Math.abs(scoresA.confidence - scoresB.confidence) > 0.2 ? 'high' : 'medium',
    });

    // Answer length
    differences.push({
      aspect: 'Answer Length',
      modelAValue: `${resultA.answer.length} chars`,
      modelBValue: `${resultB.answer.length} chars`,
      winner: 'tie',
      significance: 'low',
    });

    return differences;
  }

  private generateRecommendation(
    winner: 'modelA' | 'modelB' | 'tie',
    scoresA: ComparisonScores,
    scoresB: ComparisonScores,
    differences: ComparisonDifference[],
  ): string {
    if (winner === 'tie') {
      return 'Both models perform comparably. Consider other factors like cost, latency requirements, or specific use cases when choosing.';
    }

    const winnerLabel = winner === 'modelA' ? 'Model A' : 'Model B';
    const winnerScore = winner === 'modelA' ? scoresA.overall : scoresB.overall;
    const loserScore = winner === 'modelA' ? scoresB.overall : scoresA.overall;
    const improvement = ((winnerScore - loserScore) / loserScore * 100).toFixed(1);

    const highSignificanceDiffs = differences.filter(d => d.significance === 'high');
    const keyAdvantages = highSignificanceDiffs
      .filter(d => d.winner === winner)
      .map(d => d.aspect.toLowerCase());

    let recommendation = `${winnerLabel} is recommended with ${improvement}% better overall performance.`;

    if (keyAdvantages.length > 0) {
      recommendation += ` Key advantages: ${keyAdvantages.join(', ')}.`;
    }

    return recommendation;
  }
}
```

**Acceptance Criteria**:
- [ ] Parallel execution of two models
- [ ] Sequential execution option available
- [ ] Comprehensive metrics collection for both models
- [ ] Automatic winner determination with reasoning
- [ ] Detailed difference analysis
- [ ] SSE events for progress tracking
- [ ] Error handling for model failures
- [ ] Comprehensive logging throughout
- [ ] Unit tests with >90% coverage

---

### Task 11.1.3: Comparison API Endpoints

**Priority**: P0 (Critical)
**Effort**: 6 hours
**Dependencies**: Task 11.1.2

**Files to Create**:
- `src/comparison/dto/comparison-request.dto.ts`
- `src/comparison/dto/comparison-response.dto.ts`
- `src/comparison/comparison.controller.ts`
- `src/comparison/comparison.controller.spec.ts`

**Implementation Details**:

```typescript
// src/comparison/dto/comparison-request.dto.ts

import { IsString, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ComparisonRequestDto {
  @ApiProperty({ description: 'Research query to execute with both models' })
  @IsString()
  query: string;

  @ApiProperty({ description: 'ID of the primary model (baseline)' })
  @IsString()
  modelAId: string;

  @ApiProperty({ description: 'ID of the challenger model (being evaluated)' })
  @IsString()
  modelBId: string;

  @ApiPropertyOptional({ description: 'Run models in parallel', default: true })
  @IsOptional()
  @IsBoolean()
  runInParallel?: boolean;

  @ApiPropertyOptional({ description: 'Include detailed metrics', default: true })
  @IsOptional()
  @IsBoolean()
  includeMetrics?: boolean;

  @ApiPropertyOptional({ description: 'Run quality evaluation', default: true })
  @IsOptional()
  @IsBoolean()
  evaluateQuality?: boolean;

  @ApiPropertyOptional({ description: 'Timeout per model in milliseconds' })
  @IsOptional()
  @IsNumber()
  @Min(30000)
  @Max(600000)
  timeout?: number;

  @ApiPropertyOptional({ description: 'Purpose of comparison for tracking' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ description: 'Tags for categorization' })
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];
}
```

```typescript
// src/comparison/comparison.controller.ts

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ComparisonCoordinatorService } from './services/comparison-coordinator.service';
import { ModelConfigurationService } from '../llm/services/model-configuration.service';
import { ComparisonRequestDto } from './dto/comparison-request.dto';

@ApiTags('Model Comparison')
@Controller('api/comparison')
export class ComparisonController {
  constructor(
    private readonly comparisonService: ComparisonCoordinatorService,
    private readonly modelConfig: ModelConfigurationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Execute model comparison' })
  @ApiResponse({ status: 201, description: 'Comparison completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 403, description: 'Model comparison is disabled' })
  async executeComparison(@Body() request: ComparisonRequestDto) {
    console.log(`[ComparisonController] Received comparison request`);
    console.log(`[ComparisonController] Query: "${request.query}"`);
    console.log(`[ComparisonController] Models: ${request.modelAId} vs ${request.modelBId}`);

    // Check if comparison is enabled
    if (!this.modelConfig.isComparisonEnabled()) {
      console.log(`[ComparisonController] Comparison feature is disabled`);
      throw new HttpException(
        'Model comparison feature is currently disabled. Enable via MODEL_COMPARISON_ENABLED=true',
        HttpStatus.FORBIDDEN,
      );
    }

    // Validate models exist
    const modelA = this.modelConfig.getModelById(request.modelAId);
    const modelB = this.modelConfig.getModelById(request.modelBId);

    if (!modelA) {
      throw new HttpException(`Model not found: ${request.modelAId}`, HttpStatus.BAD_REQUEST);
    }
    if (!modelB) {
      throw new HttpException(`Model not found: ${request.modelBId}`, HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.comparisonService.executeComparison({
        query: request.query,
        modelAId: request.modelAId,
        modelBId: request.modelBId,
        options: {
          runInParallel: request.runInParallel ?? true,
          includeMetrics: request.includeMetrics ?? true,
          evaluateQuality: request.evaluateQuality ?? true,
          timeout: request.timeout,
        },
      });

      console.log(`[ComparisonController] Comparison ${result.id} completed successfully`);
      return result;
    } catch (error) {
      console.error(`[ComparisonController] Comparison failed:`, error.message);
      throw new HttpException(
        `Comparison failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('models')
  @ApiOperation({ summary: 'Get available models for comparison' })
  async getAvailableModels() {
    console.log(`[ComparisonController] Fetching available models`);

    const models = this.modelConfig.getEnabledModels();
    const defaultModel = this.modelConfig.getDefaultModel();

    return {
      models: models.map(m => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        isDefault: m.isDefault,
        capabilities: m.capabilities,
      })),
      defaultModelId: defaultModel.id,
      comparisonEnabled: this.modelConfig.isComparisonEnabled(),
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get comparison feature status' })
  async getStatus() {
    return {
      enabled: this.modelConfig.isComparisonEnabled(),
      availableModels: this.modelConfig.getEnabledModels().length,
      defaultModel: this.modelConfig.getDefaultModel().name,
    };
  }
}
```

**Acceptance Criteria**:
- [ ] POST /api/comparison endpoint for running comparisons
- [ ] GET /api/comparison/models for listing available models
- [ ] GET /api/comparison/status for feature status
- [ ] Proper validation with class-validator
- [ ] Swagger documentation
- [ ] 403 when feature is disabled
- [ ] Comprehensive error handling

---

### Task 11.1.4: Orchestrator Model Selection Integration

**Priority**: P0 (Critical)
**Effort**: 8 hours
**Dependencies**: Task 11.1.1

**Files to Modify**:
- `src/orchestration/orchestrator.service.ts`
- `src/orchestration/orchestration.module.ts`
- `src/llm/ollama.service.ts`

**Implementation Details**:

```typescript
// Add to OrchestratorService

/**
 * Execute research with a specific model configuration
 * Used for model comparison and A/B testing
 */
async executeResearchWithModel(
  query: string,
  logId: string,
  modelId: string,
): Promise<ResearchResult> {
  console.log(`[Orchestrator] executeResearchWithModel - Starting`);
  console.log(`[Orchestrator] Query: "${query}"`);
  console.log(`[Orchestrator] LogId: ${logId}`);
  console.log(`[Orchestrator] ModelId: ${modelId}`);

  // Get model configuration
  const modelConfig = this.modelConfigService.getModelById(modelId);
  if (!modelConfig) {
    throw new Error(`Model not found: ${modelId}`);
  }

  console.log(`[Orchestrator] Using model: ${modelConfig.name} (${modelConfig.provider})`);

  // Create model-specific context
  const modelContext = {
    modelId: modelConfig.id,
    modelName: modelConfig.modelName,
    provider: modelConfig.provider,
  };

  // Execute with model context (passed to LLM service)
  return this.executeResearch(query, logId, modelContext);
}
```

```typescript
// Modify OllamaService to accept model context

async chat(
  messages: Message[],
  options?: ChatOptions & { modelContext?: ModelContext },
): Promise<ChatResponse> {
  const modelName = options?.modelContext?.modelName || this.defaultModel;

  console.log(`[OllamaService] chat - Using model: ${modelName}`);

  // ... rest of implementation using modelName
}
```

**Acceptance Criteria**:
- [ ] OrchestratorService supports model selection
- [ ] OllamaService accepts model context
- [ ] Model context flows through entire pipeline
- [ ] Logging shows which model is being used
- [ ] Backward compatible (default model when not specified)

---

### Task 11.1.5: Frontend Comparison View

**Priority**: P1 (High)
**Effort**: 12 hours
**Dependencies**: Task 11.1.3

**Files to Create**:
- `client/src/app/features/comparison/comparison.module.ts`
- `client/src/app/features/comparison/comparison.ts`
- `client/src/app/features/comparison/comparison.html`
- `client/src/app/features/comparison/comparison.scss`
- `client/src/app/features/comparison/services/comparison.service.ts`
- `client/src/app/features/comparison/components/comparison-result/comparison-result.component.ts`
- `client/src/app/features/comparison/components/model-selector/model-selector.component.ts`

**Implementation Details**:

```typescript
// client/src/app/features/comparison/services/comparison.service.ts

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ComparisonRequest {
  query: string;
  modelAId: string;
  modelBId: string;
  runInParallel?: boolean;
  purpose?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  isDefault: boolean;
}

@Injectable({ providedIn: 'root' })
export class ComparisonService {
  private http = inject(HttpClient);

  // Signals for reactive state
  readonly isLoading = signal(false);
  readonly availableModels = signal<ModelInfo[]>([]);
  readonly comparisonEnabled = signal(false);
  readonly currentComparison = signal<any>(null);

  constructor() {
    this.loadModels();
  }

  async loadModels(): Promise<void> {
    console.log('[ComparisonService] Loading available models');

    try {
      const response = await this.http.get<any>('/api/comparison/models').toPromise();
      this.availableModels.set(response.models);
      this.comparisonEnabled.set(response.comparisonEnabled);
      console.log(`[ComparisonService] Loaded ${response.models.length} models`);
    } catch (error) {
      console.error('[ComparisonService] Failed to load models:', error);
    }
  }

  async executeComparison(request: ComparisonRequest): Promise<any> {
    console.log('[ComparisonService] Starting comparison');
    console.log(`[ComparisonService] Query: "${request.query}"`);
    console.log(`[ComparisonService] Models: ${request.modelAId} vs ${request.modelBId}`);

    this.isLoading.set(true);

    try {
      const result = await this.http.post<any>('/api/comparison', request).toPromise();
      this.currentComparison.set(result);
      console.log('[ComparisonService] Comparison completed');
      return result;
    } finally {
      this.isLoading.set(false);
    }
  }
}
```

**UI Design**:
```
┌────────────────────────────────────────────────────────────────────────┐
│  Model Comparison                                           [Disabled] │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Research Query:                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ Enter your research question...                                   │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌─────────────────────┐    ┌─────────────────────┐                   │
│  │  Model A (Baseline) │    │  Model B (Challenger)│                   │
│  │  [mistral-nemo ▼]   │    │  [mistral-large ▼]   │                   │
│  └─────────────────────┘    └─────────────────────┘                   │
│                                                                        │
│                    [ Run Comparison ]                                  │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  Results                                           Winner: Model B ✓   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐     │
│  │ Model A: mistral-nemo       │  │ Model B: mistral-large      │     │
│  │ Score: 72%                  │  │ Score: 85% ✓                │     │
│  ├─────────────────────────────┤  ├─────────────────────────────┤     │
│  │ Answer Quality: 70%         │  │ Answer Quality: 88%         │     │
│  │ Source Usage: 80%           │  │ Source Usage: 85%           │     │
│  │ Confidence: 65%             │  │ Confidence: 82%             │     │
│  │ Speed: 85%                  │  │ Speed: 75%                  │     │
│  │ Token Efficiency: 60%       │  │ Token Efficiency: 90%       │     │
│  ├─────────────────────────────┤  ├─────────────────────────────┤     │
│  │ Duration: 45s               │  │ Duration: 62s               │     │
│  │ Tokens: 12,500              │  │ Tokens: 8,200               │     │
│  │ Sources: 5                  │  │ Sources: 7                  │     │
│  └─────────────────────────────┘  └─────────────────────────────┘     │
│                                                                        │
│  Recommendation:                                                       │
│  Model B is recommended with 18% better overall performance.           │
│  Key advantages: higher answer quality, better confidence.             │
│                                                                        │
│  [ View Full Answer A ] [ View Full Answer B ] [ Export Results ]      │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria**:
- [ ] Model selection dropdowns
- [ ] Side-by-side results display
- [ ] Score visualization with progress bars
- [ ] Winner highlighting
- [ ] Detailed metrics comparison
- [ ] Full answer expandable views
- [ ] Export results to JSON
- [ ] Loading states with progress
- [ ] Disabled state when feature is off

---

### Task 11.1.6: Comparison History & Persistence

**Priority**: P1 (High)
**Effort**: 6 hours
**Dependencies**: Task 11.1.2

**Files to Create**:
- `src/comparison/entities/comparison-record.entity.ts`
- `src/comparison/services/comparison-history.service.ts`

**Implementation Details**:

```typescript
// src/comparison/entities/comparison-record.entity.ts

import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('comparison_records')
export class ComparisonRecordEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('text')
  query: string;

  @Column('varchar', { length: 100 })
  @Index()
  modelAId: string;

  @Column('varchar', { length: 100 })
  @Index()
  modelBId: string;

  @Column('varchar', { length: 20 })
  winner: 'modelA' | 'modelB' | 'tie';

  @Column('jsonb')
  modelAResult: Record<string, any>;

  @Column('jsonb')
  modelBResult: Record<string, any>;

  @Column('jsonb')
  comparison: Record<string, any>;

  @Column('varchar', { length: 100, nullable: true })
  purpose?: string;

  @Column('simple-array', { nullable: true })
  tags?: string[];

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
```

**Acceptance Criteria**:
- [ ] Comparison results persisted to database
- [ ] Query comparison history by model, date, winner
- [ ] Track model performance over time
- [ ] Export historical data

---

## Phase 8.2: Fact-Checker Agent

### Overview
Implement an adversarial verification layer that independently validates claims in synthesized answers against sources.

### Task 8.2.1: Fact-Checker Service

**Priority**: P0 (Critical)
**Effort**: 12 hours
**Dependencies**: Existing ConfidenceScoring, ClaimExtractor

**Files to Create**:
- `src/verification/interfaces/fact-check.interface.ts`
- `src/verification/services/fact-checker.service.ts`
- `src/verification/services/fact-checker.service.spec.ts`
- `src/verification/verification.module.ts`

**Implementation Details**:

```typescript
// src/verification/interfaces/fact-check.interface.ts

export interface FactCheckRequest {
  answer: string;
  sources: Source[];
  query: string;
}

export interface FactCheckResult {
  id: string;
  overallVerdict: 'verified' | 'partially_verified' | 'unverified' | 'contradicted';
  verifiedClaims: number;
  unverifiedClaims: number;
  contradictedClaims: number;
  claims: ClaimVerification[];
  confidence: number;
  summary: string;
  recommendations: string[];
}

export interface ClaimVerification {
  claimId: string;
  claim: string;
  verdict: 'verified' | 'unverified' | 'contradicted' | 'opinion';
  confidence: number;
  supportingSources: SourceEvidence[];
  contradictingSources: SourceEvidence[];
  explanation: string;
}

export interface SourceEvidence {
  sourceId: string;
  sourceTitle: string;
  relevantText: string;
  entailmentScore: number;
}
```

```typescript
// src/verification/services/fact-checker.service.ts

@Injectable()
export class FactCheckerService {
  constructor(
    private readonly ollama: OllamaService,
    private readonly claimExtractor: ClaimExtractorService,
    private readonly entailmentChecker: EntailmentCheckerService,
  ) {}

  async verifyAnswer(request: FactCheckRequest): Promise<FactCheckResult> {
    console.log(`[FactChecker] Starting verification for answer`);

    // 1. Extract claims from answer
    const claims = await this.claimExtractor.extractClaims(request.answer);
    console.log(`[FactChecker] Extracted ${claims.length} claims`);

    // 2. Verify each claim against sources
    const verifications = await Promise.all(
      claims.map(claim => this.verifyClaim(claim, request.sources))
    );

    // 3. Aggregate results
    const result = this.aggregateResults(verifications);
    console.log(`[FactChecker] Verification complete: ${result.overallVerdict}`);

    return result;
  }

  private async verifyClaim(
    claim: ExtractedClaim,
    sources: Source[],
  ): Promise<ClaimVerification> {
    console.log(`[FactChecker] Verifying claim: "${claim.text.substring(0, 50)}..."`);

    const supportingEvidence: SourceEvidence[] = [];
    const contradictingEvidence: SourceEvidence[] = [];

    for (const source of sources) {
      const entailment = await this.entailmentChecker.checkEntailment(
        source.content,
        claim.text,
      );

      if (entailment.relation === 'entailment' && entailment.confidence > 0.7) {
        supportingEvidence.push({
          sourceId: source.id,
          sourceTitle: source.title,
          relevantText: entailment.relevantPassage,
          entailmentScore: entailment.confidence,
        });
      } else if (entailment.relation === 'contradiction' && entailment.confidence > 0.7) {
        contradictingEvidence.push({
          sourceId: source.id,
          sourceTitle: source.title,
          relevantText: entailment.relevantPassage,
          entailmentScore: entailment.confidence,
        });
      }
    }

    const verdict = this.determineVerdict(supportingEvidence, contradictingEvidence);

    return {
      claimId: claim.id,
      claim: claim.text,
      verdict,
      confidence: this.calculateConfidence(supportingEvidence, contradictingEvidence),
      supportingSources: supportingEvidence,
      contradictingSources: contradictingEvidence,
      explanation: this.generateExplanation(verdict, supportingEvidence, contradictingEvidence),
    };
  }

  private determineVerdict(
    supporting: SourceEvidence[],
    contradicting: SourceEvidence[],
  ): ClaimVerification['verdict'] {
    if (contradicting.length > 0 && supporting.length === 0) {
      return 'contradicted';
    }
    if (supporting.length > 0 && contradicting.length === 0) {
      return 'verified';
    }
    if (supporting.length === 0 && contradicting.length === 0) {
      return 'unverified';
    }
    // Mixed evidence - needs human review
    return supporting.length > contradicting.length ? 'verified' : 'contradicted';
  }
}
```

**Acceptance Criteria**:
- [ ] Extract verifiable claims from answers
- [ ] Check each claim against all sources
- [ ] Detect contradictions between claims and sources
- [ ] Calculate verification confidence
- [ ] Generate human-readable explanations
- [ ] Comprehensive logging
- [ ] Unit tests with >90% coverage

---

### Task 8.2.2: Fact-Check Integration

**Priority**: P0 (Critical)
**Effort**: 8 hours
**Dependencies**: Task 8.2.1

**Files to Modify**:
- `src/orchestration/phase-executors/synthesis-phase-executor.ts`

**Implementation Details**:

Fact-checking runs after synthesis, before returning the final answer. Results are included in the response metadata.

```typescript
// In synthesis-phase-executor.ts

async execute(context: PhaseContext): Promise<PhaseResult> {
  // ... existing synthesis logic ...

  // After synthesis completes
  if (this.configService.get('FACT_CHECK_ENABLED', false)) {
    console.log(`[SynthesisExecutor] Running fact-check verification`);

    const factCheckResult = await this.factChecker.verifyAnswer({
      answer: synthesisResult.answer,
      sources: context.sources,
      query: context.query,
    });

    // Emit fact-check event
    await this.eventCoordinator.emit(logId, 'fact_check_completed', {
      verdict: factCheckResult.overallVerdict,
      verifiedClaims: factCheckResult.verifiedClaims,
      unverifiedClaims: factCheckResult.unverifiedClaims,
      contradictedClaims: factCheckResult.contradictedClaims,
    });

    // Add to result metadata
    synthesisResult.metadata.factCheck = factCheckResult;
  }

  return synthesisResult;
}
```

**Acceptance Criteria**:
- [ ] Fact-check runs automatically after synthesis (when enabled)
- [ ] Results included in response metadata
- [ ] SSE events for fact-check progress
- [ ] Feature flag control (FACT_CHECK_ENABLED)

---

## Phase 7.5: Confidence UI

### Task 7.5.1: Confidence Visualization Component

**Priority**: P1 (High)
**Effort**: 10 hours
**Dependencies**: Existing confidence scoring backend

**Files to Create**:
- `client/src/app/shared/components/confidence-indicator/confidence-indicator.component.ts`
- `client/src/app/shared/components/claim-tooltip/claim-tooltip.component.ts`
- `client/src/app/shared/components/source-badge/source-badge.component.ts`

**Implementation Details**:

```typescript
// Confidence indicator with color coding
@Component({
  selector: 'app-confidence-indicator',
  template: `
    <div class="confidence-indicator" [class]="confidenceClass()">
      <div class="confidence-bar" [style.width.%]="confidence() * 100"></div>
      <span class="confidence-label">{{ (confidence() * 100).toFixed(0) }}%</span>
      <span class="confidence-text">{{ confidenceText() }}</span>
    </div>
  `,
})
export class ConfidenceIndicatorComponent {
  confidence = input.required<number>();

  confidenceClass = computed(() => {
    const c = this.confidence();
    if (c >= 0.8) return 'high';
    if (c >= 0.6) return 'medium';
    return 'low';
  });

  confidenceText = computed(() => {
    const c = this.confidence();
    if (c >= 0.8) return 'High confidence';
    if (c >= 0.6) return 'Moderate confidence';
    return 'Low confidence';
  });
}
```

**UI Design**:
```
Answer Section with Confidence Visualization:

┌─────────────────────────────────────────────────────────────────────────┐
│ Overall Confidence: ████████████████████░░░░░ 82% (High)               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Quantum computing is a type of computation that harnesses quantum       │
│ mechanical phenomena[1][2]. Unlike classical computers that use bits,   │
│                      └─┬─┘└─┬─┘                                         │
│                        │    └── Hover: "Source: IBM Quantum" (92%)      │
│                        └─────── Hover: "Source: Nature" (88%)           │
│                                                                         │
│ quantum computers use qubits which can exist in superposition[3].       │
│                                                           └─┬─┘         │
│                                                             └── (78%)   │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ ⚠️ Unverified Claim: "Quantum supremacy was achieved in 2019"       │ │
│ │    No source found to support this specific claim.                  │ │
│ │    [Add Source] [Mark as Opinion]                                   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Sources:                                                                │
│ [1] IBM Quantum Computing Guide - ibm.com/quantum (92% relevance)      │
│ [2] Nature: Quantum Computing Review - nature.com (88% relevance)      │
│ [3] Wikipedia: Quantum Computing - wikipedia.org (78% relevance)       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria**:
- [ ] Color-coded confidence indicator (red/yellow/green)
- [ ] Inline source citations with hover tooltips
- [ ] Unverified claim warnings
- [ ] Source relevance scores displayed
- [ ] Expandable source details
- [ ] Mobile responsive design

---

## Configuration & Environment

### New Environment Variables

```bash
# Model Comparison (Phase 11)
MODEL_COMPARISON_ENABLED=false          # Feature toggle (default: OFF)
DEFAULT_MODEL_ID=mistral-nemo           # Default model for research
COMPARISON_TIMEOUT_MS=300000            # Max time per model in comparison (5 min)
COMPARISON_PARALLEL=true                # Run models in parallel

# Fact-Checker (Phase 8.2)
FACT_CHECK_ENABLED=false                # Feature toggle
FACT_CHECK_MIN_CLAIMS=3                 # Min claims to trigger fact-check
FACT_CHECK_CONFIDENCE_THRESHOLD=0.7     # Min confidence for verification

# Confidence UI (Phase 7.5)
SHOW_CONFIDENCE_INDICATORS=true         # Show confidence in UI
SHOW_SOURCE_TOOLTIPS=true               # Enable source hover tooltips
```

### Database Migrations

```typescript
// migrations/XXXXXX-AddModelComparison.ts

export class AddModelComparison implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Model configurations table
    await queryRunner.query(`
      CREATE TABLE model_configurations (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        model_name VARCHAR(255) NOT NULL,
        endpoint VARCHAR(500),
        context_window INTEGER NOT NULL,
        capabilities JSONB NOT NULL,
        is_default BOOLEAN DEFAULT false,
        is_enabled BOOLEAN DEFAULT true,
        added_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB
      )
    `);

    // Comparison records table
    await queryRunner.query(`
      CREATE TABLE comparison_records (
        id UUID PRIMARY KEY,
        query TEXT NOT NULL,
        model_a_id VARCHAR(100) NOT NULL,
        model_b_id VARCHAR(100) NOT NULL,
        winner VARCHAR(20) NOT NULL,
        model_a_result JSONB NOT NULL,
        model_b_result JSONB NOT NULL,
        comparison JSONB NOT NULL,
        purpose VARCHAR(100),
        tags TEXT[],
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_comparison_models ON comparison_records(model_a_id, model_b_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_comparison_created ON comparison_records(created_at)
    `);
  }
}
```

---

## Implementation Order & Dependencies

### Week 1: Model Comparison Foundation
| Day | Task | Effort | Dependencies |
|-----|------|--------|--------------|
| 1-2 | Task 11.1.1: Model Configuration Service | 8h | None |
| 2-3 | Task 11.1.4: Orchestrator Model Selection | 8h | 11.1.1 |
| 3-4 | Task 11.1.2: Comparison Coordinator | 12h | 11.1.1, 11.1.4 |
| 5 | Task 11.1.3: API Endpoints | 6h | 11.1.2 |

### Week 2: Comparison UI & Fact-Checker
| Day | Task | Effort | Dependencies |
|-----|------|--------|--------------|
| 1-2 | Task 11.1.5: Frontend Comparison View | 12h | 11.1.3 |
| 3 | Task 11.1.6: Comparison History | 6h | 11.1.2 |
| 4-5 | Task 8.2.1: Fact-Checker Service | 12h | None |
| 5 | Task 8.2.2: Fact-Check Integration | 8h | 8.2.1 |

### Week 3: Confidence UI & Polish
| Day | Task | Effort | Dependencies |
|-----|------|--------|--------------|
| 1-2 | Task 7.5.1: Confidence Visualization | 10h | None |
| 3 | Integration Testing | 8h | All |
| 4 | Bug Fixes & Polish | 8h | All |
| 5 | Documentation & Review | 4h | All |

---

## Success Metrics

### Functional Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Model comparison accuracy | Models correctly ranked 90% of time | Manual evaluation |
| Fact-check precision | >85% correct verdicts | Ground truth comparison |
| UI confidence correlation | 90% match backend | Automated tests |

### Performance Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Comparison execution | <5 min total (parallel) | Timing logs |
| Fact-check overhead | <10s additional | Phase timing |
| UI render time | <100ms for confidence | Browser profiling |

---

## Risk Assessment

### High-Risk Areas

1. **Model Comparison Timing**
   - Risk: Long execution times when comparing slow models
   - Mitigation: Timeout per model, parallel execution, progress indicators

2. **Fact-Checker False Positives**
   - Risk: Incorrectly flagging valid claims as unverified
   - Mitigation: Conservative thresholds, human review option, explanation text

3. **UI Complexity**
   - Risk: Confidence visualization overwhelming users
   - Mitigation: Progressive disclosure, optional detail levels

---

## Appendix A: SSE Events Reference

### Model Comparison Events

```typescript
// Comparison started
{
  type: 'comparison.started',
  comparisonId: string,
  query: string,
  modelA: string,
  modelB: string,
  timestamp: Date,
}

// Individual model started
{
  type: 'comparison.model.started',
  comparisonId: string,
  modelLabel: 'A' | 'B',
  modelId: string,
  modelName: string,
  timestamp: Date,
}

// Individual model completed
{
  type: 'comparison.model.completed',
  comparisonId: string,
  modelLabel: 'A' | 'B',
  modelId: string,
  durationMs: number,
  timestamp: Date,
}

// Comparison completed
{
  type: 'comparison.completed',
  comparisonId: string,
  winner: 'modelA' | 'modelB' | 'tie',
  recommendation: string,
  timestamp: Date,
}
```

### Fact-Check Events

```typescript
{
  type: 'fact_check_started',
  claimCount: number,
  timestamp: Date,
}

{
  type: 'fact_check_claim_verified',
  claimId: string,
  verdict: string,
  timestamp: Date,
}

{
  type: 'fact_check_completed',
  verdict: string,
  verifiedClaims: number,
  unverifiedClaims: number,
  contradictedClaims: number,
  timestamp: Date,
}
```

---

## Appendix B: API Reference

### Model Comparison API

```yaml
POST /api/comparison
  Request:
    query: string (required)
    modelAId: string (required)
    modelBId: string (required)
    runInParallel: boolean (default: true)
    includeMetrics: boolean (default: true)
    purpose: string (optional)
  Response:
    id: string
    query: string
    modelA: ModelExecutionResult
    modelB: ModelExecutionResult
    comparison: ComparisonAnalysis

GET /api/comparison/models
  Response:
    models: ModelInfo[]
    defaultModelId: string
    comparisonEnabled: boolean

GET /api/comparison/status
  Response:
    enabled: boolean
    availableModels: number
    defaultModel: string

GET /api/comparison/history
  Query:
    modelId: string (optional)
    winner: string (optional)
    from: Date (optional)
    to: Date (optional)
    limit: number (default: 20)
  Response:
    records: ComparisonRecord[]
    total: number
```

---

## Checklist

### Pre-Implementation
- [ ] Review existing model configuration in OllamaService
- [ ] Confirm Mistral model availability in Ollama
- [ ] Set up test queries for comparison validation
- [ ] Review frontend component architecture

### Implementation
- [ ] Phase 11 (Model Comparison) complete
- [ ] Phase 8.2 (Fact-Checker) complete
- [ ] Phase 7.5 (Confidence UI) complete
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing

### Post-Implementation
- [ ] Update API documentation
- [ ] Update user documentation
- [ ] Performance benchmarks documented
- [ ] Feature flags documented
- [ ] Rollout plan reviewed
