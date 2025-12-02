# Implementation Plan: Sprint 1-2 (Foundation)

**Last Updated**: 2025-12-02
**Sprint Focus**: ReAct Reasoning Traces, Confidence Scoring Pipeline, Working Memory
**Duration**: 2 Sprints (~4 weeks)
**Prerequisites**: Completed Phase 5 (Semantic Search)

---

## Sprint Overview

This sprint establishes the foundation for agentic behavior by implementing:

1. **6.1 ReAct Reasoning Traces** - Visible reasoning in the research pipeline
2. **7.1-7.4 Confidence Scoring** - Claim extraction and uncertainty quantification
3. **9.1 Working Memory** - Current task context management

These foundational components enable subsequent phases (Reflexion, Multi-Agent, etc.).

---

## Task 1: ReAct Reasoning Traces (6.1)

**Objective**: Make agent reasoning visible through explicit Thought→Action→Observation events

### 1.1 Create Reasoning Event Types

**File**: `src/common/events/reasoning-events.ts`

```typescript
export enum ReasoningEventType {
  THOUGHT = 'thought',
  ACTION_PLANNED = 'action_planned',
  OBSERVATION = 'observation',
  CONCLUSION = 'conclusion',
}

export interface ThoughtEvent {
  type: ReasoningEventType.THOUGHT;
  logId: string;
  timestamp: Date;
  content: string;
  context: {
    stage: string;
    step: number;
    relatedTo?: string; // Previous thought/observation ID
  };
}

export interface ActionPlannedEvent {
  type: ReasoningEventType.ACTION_PLANNED;
  logId: string;
  timestamp: Date;
  action: string;
  tool: string;
  parameters: Record<string, any>;
  reasoning: string; // Why this action was chosen
}

export interface ObservationEvent {
  type: ReasoningEventType.OBSERVATION;
  logId: string;
  timestamp: Date;
  actionId: string;
  result: string;
  analysis: string; // Agent's interpretation of the result
  implications: string[]; // What this means for the task
}

export interface ConclusionEvent {
  type: ReasoningEventType.CONCLUSION;
  logId: string;
  timestamp: Date;
  conclusion: string;
  supportingThoughts: string[];
  confidence: number;
  nextSteps?: string[];
}
```

### 1.2 Create ReasoningTraceService

**File**: `src/orchestration/services/reasoning-trace.service.ts`

```typescript
@Injectable()
export class ReasoningTraceService {
  constructor(
    private readonly eventCoordinator: EventCoordinatorService,
    private readonly researchLogger: ResearchLoggerService,
  ) {}

  async emitThought(logId: string, content: string, context: ThoughtContext): Promise<string> {
    const thoughtId = uuidv4();
    const event: ThoughtEvent = {
      type: ReasoningEventType.THOUGHT,
      logId,
      timestamp: new Date(),
      content,
      context,
    };

    this.eventCoordinator.emit(logId, 'reasoning_thought', event);
    this.researchLogger.log(logId, 'reasoning', 'thought', { thoughtId, content });

    return thoughtId;
  }

  async emitActionPlan(
    logId: string,
    action: string,
    tool: string,
    parameters: Record<string, any>,
    reasoning: string
  ): Promise<string> {
    const actionId = uuidv4();
    const event: ActionPlannedEvent = {
      type: ReasoningEventType.ACTION_PLANNED,
      logId,
      timestamp: new Date(),
      action,
      tool,
      parameters,
      reasoning,
    };

    this.eventCoordinator.emit(logId, 'reasoning_action', event);
    this.researchLogger.log(logId, 'reasoning', 'action_planned', { actionId, action, tool });

    return actionId;
  }

  async emitObservation(
    logId: string,
    actionId: string,
    result: string,
    analysis: string,
    implications: string[]
  ): Promise<void> {
    const event: ObservationEvent = {
      type: ReasoningEventType.OBSERVATION,
      logId,
      timestamp: new Date(),
      actionId,
      result,
      analysis,
      implications,
    };

    this.eventCoordinator.emit(logId, 'reasoning_observation', event);
    this.researchLogger.log(logId, 'reasoning', 'observation', { actionId, analysis });
  }

  async emitConclusion(
    logId: string,
    conclusion: string,
    supportingThoughts: string[],
    confidence: number,
    nextSteps?: string[]
  ): Promise<void> {
    const event: ConclusionEvent = {
      type: ReasoningEventType.CONCLUSION,
      logId,
      timestamp: new Date(),
      conclusion,
      supportingThoughts,
      confidence,
      nextSteps,
    };

    this.eventCoordinator.emit(logId, 'reasoning_conclusion', event);
    this.researchLogger.log(logId, 'reasoning', 'conclusion', { conclusion, confidence });
  }
}
```

### 1.3 Integrate with PlannerService

**File**: `src/orchestration/services/planner.service.ts` (modify existing)

Add reasoning traces to the planning process:

```typescript
async generatePlan(logId: string, query: string, context: PlanContext): Promise<ResearchPlan> {
  // Emit thought about query analysis
  await this.reasoningTrace.emitThought(logId,
    `Analyzing query: "${query}". Identifying key concepts and information needs.`,
    { stage: 'planning', step: 1 }
  );

  // Check internal knowledge first
  const thoughtId = await this.reasoningTrace.emitThought(logId,
    'Checking internal knowledge base for relevant prior research.',
    { stage: 'planning', step: 2 }
  );

  const actionId = await this.reasoningTrace.emitActionPlan(logId,
    'Search internal knowledge',
    'knowledge_search',
    { query, limit: 5 },
    'Prior research may provide relevant context or partial answers.'
  );

  const knowledgeResults = await this.knowledgeSearch.search(query);

  await this.reasoningTrace.emitObservation(logId, actionId,
    `Found ${knowledgeResults.length} relevant prior research results.`,
    knowledgeResults.length > 0
      ? 'Prior research can inform our approach and potentially reduce external searches.'
      : 'No directly relevant prior research found. Will rely on external sources.',
    knowledgeResults.length > 0
      ? ['Can leverage existing findings', 'May need fewer external searches']
      : ['Full external search required', 'Building new knowledge']
  );

  // Continue with plan generation...
  await this.reasoningTrace.emitThought(logId,
    `Planning search strategy. Query complexity: ${this.assessComplexity(query)}. ` +
    `Estimated sources needed: ${this.estimateSourceCount(query)}.`,
    { stage: 'planning', step: 3, relatedTo: thoughtId }
  );

  // ... rest of planning logic

  await this.reasoningTrace.emitConclusion(logId,
    `Generated ${plan.phases.length}-phase research plan with ${plan.totalSteps} steps.`,
    [thoughtId],
    0.85,
    plan.phases.map(p => p.name)
  );

  return plan;
}
```

### 1.4 Integrate with Tool Execution

**File**: `src/tools/registry/tool-registry.service.ts` (modify existing)

Wrap tool execution with reasoning traces:

```typescript
async executeTool(
  logId: string,
  toolName: string,
  parameters: Record<string, any>
): Promise<ToolResult> {
  // Emit action plan
  const actionId = await this.reasoningTrace.emitActionPlan(logId,
    `Execute ${toolName}`,
    toolName,
    parameters,
    this.getToolReasoning(toolName, parameters)
  );

  try {
    const result = await this.tools.get(toolName).execute(parameters);

    // Emit observation
    await this.reasoningTrace.emitObservation(logId, actionId,
      this.summarizeResult(result),
      this.analyzeResult(toolName, result),
      this.extractImplications(toolName, result)
    );

    return result;
  } catch (error) {
    await this.reasoningTrace.emitObservation(logId, actionId,
      `Tool execution failed: ${error.message}`,
      'Error encountered during tool execution. May need alternative approach.',
      ['Consider retry', 'Consider fallback tool', 'May impact answer completeness']
    );
    throw error;
  }
}
```

### 1.5 Frontend: Reasoning Trace Component

**File**: `client/src/app/shared/components/reasoning-trace/reasoning-trace.component.ts`

```typescript
@Component({
  selector: 'app-reasoning-trace',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="reasoning-trace">
      <h3 class="reasoning-trace__title">Agent Reasoning</h3>

      <div class="reasoning-trace__timeline">
        @for (event of reasoningEvents(); track event.timestamp) {
          <div class="reasoning-trace__event"
               [class]="'reasoning-trace__event--' + event.type">

            <div class="reasoning-trace__icon">
              @switch (event.type) {
                @case ('thought') { <span>🤔</span> }
                @case ('action_planned') { <span>⚡</span> }
                @case ('observation') { <span>👁️</span> }
                @case ('conclusion') { <span>💡</span> }
              }
            </div>

            <div class="reasoning-trace__content">
              <div class="reasoning-trace__type">{{ getTypeLabel(event.type) }}</div>
              <div class="reasoning-trace__text">{{ event.content || event.conclusion || event.analysis }}</div>

              @if (event.type === 'action_planned') {
                <div class="reasoning-trace__meta">
                  Tool: {{ event.tool }} | {{ event.reasoning }}
                </div>
              }

              @if (event.type === 'observation' && event.implications?.length) {
                <div class="reasoning-trace__implications">
                  @for (impl of event.implications; track impl) {
                    <span class="reasoning-trace__tag">{{ impl }}</span>
                  }
                </div>
              }

              @if (event.type === 'conclusion') {
                <div class="reasoning-trace__confidence">
                  Confidence: {{ (event.confidence * 100).toFixed(0) }}%
                </div>
              }
            </div>

            <div class="reasoning-trace__time">
              {{ event.timestamp | date:'HH:mm:ss' }}
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styleUrl: './reasoning-trace.component.scss'
})
export class ReasoningTraceComponent {
  reasoningEvents = input.required<ReasoningEvent[]>();

  getTypeLabel(type: string): string {
    const labels = {
      thought: 'Thinking',
      action_planned: 'Planning Action',
      observation: 'Observing',
      conclusion: 'Concluding'
    };
    return labels[type] || type;
  }
}
```

### 1.6 Tests for ReasoningTraceService

**File**: `src/orchestration/services/reasoning-trace.service.spec.ts`

```typescript
describe('ReasoningTraceService', () => {
  let service: ReasoningTraceService;
  let eventCoordinator: MockEventCoordinator;
  let researchLogger: MockResearchLogger;

  beforeEach(async () => {
    // Setup test module...
  });

  describe('emitThought', () => {
    it('should emit thought event with unique ID', async () => {
      const logId = 'test-log-id';
      const content = 'Analyzing query complexity';

      const thoughtId = await service.emitThought(logId, content, {
        stage: 'planning',
        step: 1
      });

      expect(thoughtId).toBeDefined();
      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_thought',
        expect.objectContaining({ content })
      );
    });
  });

  describe('emitObservation', () => {
    it('should link observation to action', async () => {
      const logId = 'test-log-id';
      const actionId = 'action-123';

      await service.emitObservation(
        logId,
        actionId,
        'Found 5 relevant sources',
        'Good coverage of topic',
        ['Can proceed to synthesis']
      );

      expect(eventCoordinator.emit).toHaveBeenCalledWith(
        logId,
        'reasoning_observation',
        expect.objectContaining({ actionId })
      );
    });
  });
});
```

---

## Task 2: Confidence Scoring Pipeline (7.1-7.4)

**Objective**: Quantify uncertainty in generated answers at the claim level

### 2.1 Create Claim Extractor Service

**File**: `src/evaluation/services/claim-extractor.service.ts`

```typescript
export interface Claim {
  id: string;
  text: string;
  type: 'factual' | 'comparative' | 'temporal' | 'causal' | 'opinion';
  substantiveWords: SubstantiveWord[];
  sourceSpan: { start: number; end: number };
}

export interface SubstantiveWord {
  word: string;
  type: 'noun' | 'verb' | 'numeral' | 'proper_noun';
  position: number;
  importance: number; // 0.0 - 1.0
}

@Injectable()
export class ClaimExtractorService {
  constructor(private readonly ollamaService: OllamaService) {}

  async extractClaims(answer: string): Promise<Claim[]> {
    const prompt = this.buildExtractionPrompt(answer);
    const response = await this.ollamaService.generate(prompt);
    const rawClaims = this.parseClaimsResponse(response);

    return rawClaims.map(claim => ({
      ...claim,
      id: uuidv4(),
      substantiveWords: this.extractSubstantiveWords(claim.text),
    }));
  }

  private buildExtractionPrompt(answer: string): string {
    return `Extract all factual claims from the following text.
For each claim, identify:
1. The exact claim text
2. The type (factual, comparative, temporal, causal, opinion)
3. The character positions (start, end)

Text:
"""
${answer}
"""

Respond in JSON format:
{
  "claims": [
    {
      "text": "claim text here",
      "type": "factual",
      "sourceSpan": { "start": 0, "end": 50 }
    }
  ]
}`;
  }

  private extractSubstantiveWords(text: string): SubstantiveWord[] {
    // Simple POS-like extraction (could be enhanced with actual NLP library)
    const words = text.split(/\s+/);
    const substantive: SubstantiveWord[] = [];

    words.forEach((word, index) => {
      const cleanWord = word.replace(/[.,!?;:]/g, '');
      const type = this.classifyWord(cleanWord);

      if (type) {
        substantive.push({
          word: cleanWord,
          type,
          position: index,
          importance: this.calculateImportance(type, cleanWord),
        });
      }
    });

    return substantive;
  }

  private classifyWord(word: string): SubstantiveWord['type'] | null {
    // Numerals
    if (/^\d+(\.\d+)?%?$/.test(word)) return 'numeral';

    // Proper nouns (capitalized, not sentence start)
    if (/^[A-Z][a-z]+/.test(word)) return 'proper_noun';

    // Common patterns for nouns/verbs (simplified)
    // In production, use a proper NLP library
    return null;
  }

  private calculateImportance(type: SubstantiveWord['type'], word: string): number {
    const baseImportance = {
      proper_noun: 1.0,
      numeral: 0.95,
      noun: 0.8,
      verb: 0.7,
    };
    return baseImportance[type] || 0.5;
  }
}
```

### 2.2 Create Entailment Checker Service

**File**: `src/evaluation/services/entailment-checker.service.ts`

```typescript
export interface EntailmentResult {
  claim: Claim;
  verdict: 'entailed' | 'neutral' | 'contradicted';
  score: number; // 0.0 - 1.0
  supportingSources: SourceEvidence[];
  contradictingSources: SourceEvidence[];
  reasoning: string;
}

export interface SourceEvidence {
  sourceId: string;
  sourceUrl: string;
  relevantText: string;
  similarity: number;
}

@Injectable()
export class EntailmentCheckerService {
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async checkEntailment(claim: Claim, sources: Source[]): Promise<EntailmentResult> {
    // Find relevant passages in sources
    const relevantPassages = await this.findRelevantPassages(claim.text, sources);

    if (relevantPassages.length === 0) {
      return {
        claim,
        verdict: 'neutral',
        score: 0.3, // Low confidence when no sources found
        supportingSources: [],
        contradictingSources: [],
        reasoning: 'No relevant source passages found for this claim.',
      };
    }

    // Use LLM to assess entailment
    const entailmentAssessment = await this.assessEntailment(claim.text, relevantPassages);

    return {
      claim,
      verdict: entailmentAssessment.verdict,
      score: entailmentAssessment.score,
      supportingSources: entailmentAssessment.supporting,
      contradictingSources: entailmentAssessment.contradicting,
      reasoning: entailmentAssessment.reasoning,
    };
  }

  private async findRelevantPassages(claimText: string, sources: Source[]): Promise<SourceEvidence[]> {
    const claimEmbedding = await this.embeddingService.generateEmbedding(claimText);
    const passages: SourceEvidence[] = [];

    for (const source of sources) {
      // Split source content into passages
      const sourcePassages = this.splitIntoPassages(source.content);

      for (const passage of sourcePassages) {
        const passageEmbedding = await this.embeddingService.generateEmbedding(passage);
        const similarity = this.cosineSimilarity(claimEmbedding, passageEmbedding);

        if (similarity > 0.7) { // Threshold for relevance
          passages.push({
            sourceId: source.id,
            sourceUrl: source.url,
            relevantText: passage,
            similarity,
          });
        }
      }
    }

    return passages.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  }

  private async assessEntailment(
    claim: string,
    passages: SourceEvidence[]
  ): Promise<{
    verdict: 'entailed' | 'neutral' | 'contradicted';
    score: number;
    supporting: SourceEvidence[];
    contradicting: SourceEvidence[];
    reasoning: string;
  }> {
    const prompt = `Assess whether the following claim is supported by the provided source passages.

Claim: "${claim}"

Source Passages:
${passages.map((p, i) => `[${i + 1}] ${p.relevantText}`).join('\n\n')}

Determine:
1. Verdict: Does the evidence support (entailed), contradict (contradicted), or neither (neutral) the claim?
2. Score: Confidence in the verdict (0.0 - 1.0)
3. Which passages support the claim (by number)
4. Which passages contradict the claim (by number)
5. Brief reasoning

Respond in JSON:
{
  "verdict": "entailed|neutral|contradicted",
  "score": 0.85,
  "supportingPassages": [1, 3],
  "contradictingPassages": [],
  "reasoning": "The claim is supported by..."
}`;

    const response = await this.ollamaService.generate(prompt);
    const parsed = this.parseEntailmentResponse(response);

    return {
      verdict: parsed.verdict,
      score: parsed.score,
      supporting: parsed.supportingPassages.map(i => passages[i - 1]).filter(Boolean),
      contradicting: parsed.contradictingPassages.map(i => passages[i - 1]).filter(Boolean),
      reasoning: parsed.reasoning,
    };
  }

  private splitIntoPassages(content: string, maxLength: number = 500): string[] {
    const sentences = content.split(/[.!?]+\s+/);
    const passages: string[] = [];
    let currentPassage = '';

    for (const sentence of sentences) {
      if ((currentPassage + sentence).length > maxLength) {
        if (currentPassage) passages.push(currentPassage.trim());
        currentPassage = sentence;
      } else {
        currentPassage += (currentPassage ? '. ' : '') + sentence;
      }
    }
    if (currentPassage) passages.push(currentPassage.trim());

    return passages;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
}
```

### 2.3 Create SUScore Calculator

**File**: `src/evaluation/services/suscore-calculator.service.ts`

```typescript
export interface SUScoreResult {
  overallScore: number; // 0.0 - 1.0 (higher = more confident)
  claimScores: ClaimSUScore[];
  methodology: string;
}

export interface ClaimSUScore {
  claimId: string;
  score: number;
  wordBreakdown: WordUncertainty[];
}

export interface WordUncertainty {
  word: string;
  importance: number;
  uncertainty: number;
  contribution: number; // importance * uncertainty
}

@Injectable()
export class SUScoreCalculatorService {
  /**
   * Calculate Substantive-word Uncertainty Score
   *
   * SUScore = 1 - (Σ(importance × uncertainty) / Σ(importance))
   *
   * Where:
   * - importance: Word type weight (nouns=1.0, verbs=0.8, others=0.3)
   * - uncertainty: 1 - entailment_score for that word's context
   */
  calculateSUScore(
    claims: Claim[],
    entailmentResults: Map<string, EntailmentResult>
  ): SUScoreResult {
    const claimScores: ClaimSUScore[] = [];
    let totalWeightedUncertainty = 0;
    let totalImportance = 0;

    for (const claim of claims) {
      const entailment = entailmentResults.get(claim.id);
      if (!entailment) continue;

      const wordBreakdown: WordUncertainty[] = [];
      let claimWeightedUncertainty = 0;
      let claimImportance = 0;

      for (const word of claim.substantiveWords) {
        const uncertainty = 1 - entailment.score;
        const contribution = word.importance * uncertainty;

        wordBreakdown.push({
          word: word.word,
          importance: word.importance,
          uncertainty,
          contribution,
        });

        claimWeightedUncertainty += contribution;
        claimImportance += word.importance;
      }

      const claimScore = claimImportance > 0
        ? 1 - (claimWeightedUncertainty / claimImportance)
        : 0.5; // Default when no substantive words

      claimScores.push({
        claimId: claim.id,
        score: claimScore,
        wordBreakdown,
      });

      totalWeightedUncertainty += claimWeightedUncertainty;
      totalImportance += claimImportance;
    }

    const overallScore = totalImportance > 0
      ? 1 - (totalWeightedUncertainty / totalImportance)
      : 0.5;

    return {
      overallScore,
      claimScores,
      methodology: 'SUScore: Substantive-word weighted uncertainty quantification',
    };
  }
}
```

### 2.4 Create Confidence Aggregator Service

**File**: `src/evaluation/services/confidence-aggregator.service.ts`

```typescript
export interface ConfidenceResult {
  overallConfidence: number;
  level: 'high' | 'medium' | 'low' | 'very_low';
  claimConfidences: ClaimConfidence[];
  methodology: ConfidenceMethodology;
  recommendations: string[];
}

export interface ClaimConfidence {
  claimId: string;
  claimText: string;
  confidence: number;
  level: 'high' | 'medium' | 'low' | 'very_low';
  entailmentScore: number;
  suScore: number;
  supportingSources: number;
}

export interface ConfidenceMethodology {
  entailmentWeight: number;
  suScoreWeight: number;
  sourceCountWeight: number;
}

@Injectable()
export class ConfidenceAggregatorService {
  private readonly methodology: ConfidenceMethodology = {
    entailmentWeight: 0.5,
    suScoreWeight: 0.3,
    sourceCountWeight: 0.2,
  };

  aggregateConfidence(
    claims: Claim[],
    entailmentResults: Map<string, EntailmentResult>,
    suScoreResult: SUScoreResult
  ): ConfidenceResult {
    const claimConfidences: ClaimConfidence[] = [];

    for (const claim of claims) {
      const entailment = entailmentResults.get(claim.id);
      const suScore = suScoreResult.claimScores.find(s => s.claimId === claim.id);

      if (!entailment || !suScore) continue;

      const sourceCount = entailment.supportingSources.length;
      const sourceScore = Math.min(sourceCount / 3, 1); // Normalize to max 3 sources

      const confidence =
        entailment.score * this.methodology.entailmentWeight +
        suScore.score * this.methodology.suScoreWeight +
        sourceScore * this.methodology.sourceCountWeight;

      claimConfidences.push({
        claimId: claim.id,
        claimText: claim.text,
        confidence,
        level: this.getConfidenceLevel(confidence),
        entailmentScore: entailment.score,
        suScore: suScore.score,
        supportingSources: sourceCount,
      });
    }

    const overallConfidence = claimConfidences.length > 0
      ? claimConfidences.reduce((sum, c) => sum + c.confidence, 0) / claimConfidences.length
      : 0.5;

    return {
      overallConfidence,
      level: this.getConfidenceLevel(overallConfidence),
      claimConfidences,
      methodology: this.methodology,
      recommendations: this.generateRecommendations(claimConfidences),
    };
  }

  private getConfidenceLevel(score: number): 'high' | 'medium' | 'low' | 'very_low' {
    if (score >= 0.85) return 'high';
    if (score >= 0.7) return 'medium';
    if (score >= 0.5) return 'low';
    return 'very_low';
  }

  private generateRecommendations(claimConfidences: ClaimConfidence[]): string[] {
    const recommendations: string[] = [];

    const lowConfidenceClaims = claimConfidences.filter(c => c.confidence < 0.5);
    if (lowConfidenceClaims.length > 0) {
      recommendations.push(
        `${lowConfidenceClaims.length} claim(s) have low confidence and may need verification.`
      );
    }

    const unsupportedClaims = claimConfidences.filter(c => c.supportingSources === 0);
    if (unsupportedClaims.length > 0) {
      recommendations.push(
        `${unsupportedClaims.length} claim(s) lack source support.`
      );
    }

    return recommendations;
  }
}
```

### 2.5 Create Confidence Scoring Orchestrator

**File**: `src/evaluation/services/confidence-scoring.service.ts`

```typescript
@Injectable()
export class ConfidenceScoringService {
  constructor(
    private readonly claimExtractor: ClaimExtractorService,
    private readonly entailmentChecker: EntailmentCheckerService,
    private readonly suScoreCalculator: SUScoreCalculatorService,
    private readonly confidenceAggregator: ConfidenceAggregatorService,
    private readonly researchLogger: ResearchLoggerService,
  ) {}

  async scoreConfidence(
    logId: string,
    answer: string,
    sources: Source[]
  ): Promise<ConfidenceResult> {
    this.researchLogger.log(logId, 'confidence', 'started', { answerLength: answer.length });

    // Step 1: Extract claims
    const claims = await this.claimExtractor.extractClaims(answer);
    this.researchLogger.log(logId, 'confidence', 'claims_extracted', { count: claims.length });

    // Step 2: Check entailment for each claim
    const entailmentResults = new Map<string, EntailmentResult>();
    for (const claim of claims) {
      const result = await this.entailmentChecker.checkEntailment(claim, sources);
      entailmentResults.set(claim.id, result);
    }
    this.researchLogger.log(logId, 'confidence', 'entailment_checked', {
      checked: entailmentResults.size
    });

    // Step 3: Calculate SUScore
    const suScoreResult = this.suScoreCalculator.calculateSUScore(claims, entailmentResults);
    this.researchLogger.log(logId, 'confidence', 'suscore_calculated', {
      score: suScoreResult.overallScore
    });

    // Step 4: Aggregate confidence
    const confidenceResult = this.confidenceAggregator.aggregateConfidence(
      claims,
      entailmentResults,
      suScoreResult
    );
    this.researchLogger.log(logId, 'confidence', 'completed', {
      overall: confidenceResult.overallConfidence,
      level: confidenceResult.level
    });

    return confidenceResult;
  }
}
```

---

## Task 3: Working Memory (9.1)

**Objective**: Maintain current task context for use across pipeline stages

### 3.1 Create Working Memory Service

**File**: `src/orchestration/services/working-memory.service.ts`

```typescript
export interface WorkingMemory {
  taskId: string;
  logId: string;
  query: string;
  startTime: Date;
  currentPhase: string;
  currentStep: number;

  // Goals tracking
  primaryGoal: string;
  subGoals: SubGoal[];

  // Intermediate state
  gatheredInformation: GatheredInfo[];
  activeHypotheses: Hypothesis[];
  identifiedGaps: Gap[];

  // Scratchpad for complex operations
  scratchPad: Map<string, any>;

  // Reasoning trace reference
  thoughtChain: string[]; // IDs of thoughts
}

export interface SubGoal {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: number;
  dependencies: string[];
}

export interface GatheredInfo {
  id: string;
  content: string;
  source: string;
  relevance: number;
  addedAt: Date;
}

export interface Hypothesis {
  id: string;
  statement: string;
  confidence: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
}

export interface Gap {
  id: string;
  description: string;
  severity: 'critical' | 'important' | 'minor';
  suggestedAction: string;
}

@Injectable()
export class WorkingMemoryService {
  private memories = new Map<string, WorkingMemory>();

  initialize(logId: string, query: string): WorkingMemory {
    const memory: WorkingMemory = {
      taskId: uuidv4(),
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
      id: uuidv4(),
    };
    memory.subGoals.push(subGoal);
    return subGoal.id;
  }

  updateSubGoalStatus(logId: string, goalId: string, status: SubGoal['status']): void {
    const memory = this.memories.get(logId);
    if (!memory) return;

    const goal = memory.subGoals.find(g => g.id === goalId);
    if (goal) {
      goal.status = status;
    }
  }

  addGatheredInfo(logId: string, info: Omit<GatheredInfo, 'id' | 'addedAt'>): string {
    const memory = this.memories.get(logId);
    if (!memory) throw new Error(`No working memory for logId: ${logId}`);

    const gathered: GatheredInfo = {
      ...info,
      id: uuidv4(),
      addedAt: new Date(),
    };
    memory.gatheredInformation.push(gathered);
    return gathered.id;
  }

  addHypothesis(logId: string, statement: string, confidence: number): string {
    const memory = this.memories.get(logId);
    if (!memory) throw new Error(`No working memory for logId: ${logId}`);

    const hypothesis: Hypothesis = {
      id: uuidv4(),
      statement,
      confidence,
      supportingEvidence: [],
      contradictingEvidence: [],
    };
    memory.activeHypotheses.push(hypothesis);
    return hypothesis.id;
  }

  addGap(logId: string, gap: Omit<Gap, 'id'>): string {
    const memory = this.memories.get(logId);
    if (!memory) throw new Error(`No working memory for logId: ${logId}`);

    const identifiedGap: Gap = {
      ...gap,
      id: uuidv4(),
    };
    memory.identifiedGaps.push(identifiedGap);
    return identifiedGap.id;
  }

  setScratchPadValue(logId: string, key: string, value: any): void {
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

    return `
Current Phase: ${memory.currentPhase} (Step ${memory.currentStep})
Primary Goal: ${memory.primaryGoal}

Sub-goals:
${memory.subGoals.map(g => `- [${g.status}] ${g.description}`).join('\n')}

Gathered Information (${memory.gatheredInformation.length} items):
${memory.gatheredInformation.slice(-5).map(i => `- ${i.content.substring(0, 100)}...`).join('\n')}

Active Hypotheses:
${memory.activeHypotheses.map(h => `- ${h.statement} (confidence: ${h.confidence})`).join('\n')}

Identified Gaps:
${memory.identifiedGaps.filter(g => g.severity !== 'minor').map(g => `- [${g.severity}] ${g.description}`).join('\n')}
`.trim();
  }

  cleanup(logId: string): void {
    this.memories.delete(logId);
  }
}
```

### 3.2 Integrate Working Memory with Orchestrator

**File**: `src/orchestration/services/orchestrator.service.ts` (modify existing)

```typescript
async executeResearch(logId: string, query: string): Promise<ResearchResult> {
  // Initialize working memory
  const workingMemory = this.workingMemoryService.initialize(logId, query);

  try {
    // Add sub-goals based on query analysis
    const queryAnalysis = await this.analyzeQuery(query);
    for (const aspect of queryAnalysis.aspects) {
      this.workingMemoryService.addSubGoal(logId, {
        description: `Find information about: ${aspect}`,
        status: 'pending',
        priority: aspect.importance,
        dependencies: [],
      });
    }

    // Execute pipeline with working memory context
    const plan = await this.plannerService.generatePlan(logId, query, {
      workingMemoryContext: this.workingMemoryService.getContext(logId),
    });

    // ... rest of execution

    // Track gaps during execution
    for (const phase of plan.phases) {
      this.workingMemoryService.updatePhase(logId, phase.name, phase.step);

      const result = await this.executePhase(logId, phase);

      // Add gathered information to working memory
      for (const source of result.sources) {
        this.workingMemoryService.addGatheredInfo(logId, {
          content: source.summary,
          source: source.url,
          relevance: source.relevance,
        });
      }

      // Identify gaps
      const gaps = await this.identifyGaps(logId, result);
      for (const gap of gaps) {
        this.workingMemoryService.addGap(logId, gap);
      }
    }

    return result;
  } finally {
    // Cleanup working memory after completion
    this.workingMemoryService.cleanup(logId);
  }
}
```

---

## Task 4: Module Registration & Integration

### 4.1 Create Reasoning Module

**File**: `src/reasoning/reasoning.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ReasoningTraceService } from './services/reasoning-trace.service';

@Module({
  providers: [ReasoningTraceService],
  exports: [ReasoningTraceService],
})
export class ReasoningModule {}
```

### 4.2 Update Evaluation Module

**File**: `src/evaluation/evaluation.module.ts` (modify existing)

```typescript
import { Module } from '@nestjs/common';
import { ClaimExtractorService } from './services/claim-extractor.service';
import { EntailmentCheckerService } from './services/entailment-checker.service';
import { SUScoreCalculatorService } from './services/suscore-calculator.service';
import { ConfidenceAggregatorService } from './services/confidence-aggregator.service';
import { ConfidenceScoringService } from './services/confidence-scoring.service';
// ... existing imports

@Module({
  imports: [LlmModule, KnowledgeModule],
  providers: [
    // Existing services
    EvaluationService,
    AnswerEvaluatorService,
    RetrievalEvaluatorService,
    ScoreAggregatorService,
    // New confidence scoring services
    ClaimExtractorService,
    EntailmentCheckerService,
    SUScoreCalculatorService,
    ConfidenceAggregatorService,
    ConfidenceScoringService,
  ],
  exports: [
    EvaluationService,
    ConfidenceScoringService,
  ],
})
export class EvaluationModule {}
```

### 4.3 Update Orchestration Module

**File**: `src/orchestration/orchestration.module.ts` (modify existing)

```typescript
import { Module } from '@nestjs/common';
import { WorkingMemoryService } from './services/working-memory.service';
import { ReasoningModule } from '../reasoning/reasoning.module';
// ... existing imports

@Module({
  imports: [
    ReasoningModule,
    // ... existing imports
  ],
  providers: [
    // Existing services
    OrchestratorService,
    PlannerService,
    MilestoneService,
    EventCoordinatorService,
    // New services
    WorkingMemoryService,
  ],
  exports: [
    OrchestratorService,
    PlannerService,
    WorkingMemoryService,
  ],
})
export class OrchestrationModule {}
```

---

## Task 5: SSE Event Updates

### 5.1 Add New Event Types

**File**: `src/common/events/sse-events.ts` (modify existing)

```typescript
export type SSEEventType =
  // Existing events
  | 'session_started' | 'session_completed'
  | 'planning_started' | 'planning_completed'
  // ... other existing events

  // NEW: Reasoning trace events
  | 'reasoning_thought'
  | 'reasoning_action'
  | 'reasoning_observation'
  | 'reasoning_conclusion'

  // NEW: Confidence scoring events
  | 'confidence_scoring_started'
  | 'claims_extracted'
  | 'entailment_checked'
  | 'confidence_calculated';
```

### 5.2 Update Research Stream Controller

**File**: `src/research/research-stream.controller.ts` (modify existing)

Add handling for new event types in the SSE stream.

---

## Task 6: Frontend Updates

### 6.1 Update Agent Activity Service

**File**: `client/src/app/core/services/agent-activity.service.ts` (modify existing)

Add handling for reasoning and confidence events.

### 6.2 Create Confidence Display Component

**File**: `client/src/app/shared/components/confidence-display/confidence-display.component.ts`

```typescript
@Component({
  selector: 'app-confidence-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="confidence-display">
      <div class="confidence-display__header">
        <h3>Answer Confidence</h3>
        <div class="confidence-display__overall"
             [class]="'confidence-display__overall--' + result().level">
          {{ (result().overallConfidence * 100).toFixed(0) }}%
        </div>
      </div>

      @if (result().recommendations.length > 0) {
        <div class="confidence-display__recommendations">
          @for (rec of result().recommendations; track rec) {
            <div class="confidence-display__recommendation">
              <span class="warning-icon">⚠️</span>
              {{ rec }}
            </div>
          }
        </div>
      }

      <div class="confidence-display__claims">
        <h4>Claim-level Confidence</h4>
        @for (claim of result().claimConfidences; track claim.claimId) {
          <div class="confidence-display__claim"
               [class]="'confidence-display__claim--' + claim.level">
            <div class="confidence-display__claim-bar">
              <div class="confidence-display__claim-fill"
                   [style.width.%]="claim.confidence * 100">
              </div>
            </div>
            <div class="confidence-display__claim-text">
              {{ claim.claimText }}
            </div>
            <div class="confidence-display__claim-score">
              {{ (claim.confidence * 100).toFixed(0) }}%
            </div>
            @if (claim.supportingSources === 0) {
              <span class="confidence-display__no-source" title="No supporting sources found">
                ⚠️ Unsupported
              </span>
            }
          </div>
        }
      </div>
    </div>
  `,
  styleUrl: './confidence-display.component.scss'
})
export class ConfidenceDisplayComponent {
  result = input.required<ConfidenceResult>();
}
```

---

## Testing Strategy

### Unit Tests Required

| Service | Test File | Key Test Cases |
|---------|-----------|----------------|
| ReasoningTraceService | `reasoning-trace.service.spec.ts` | Event emission, ID generation, logging |
| ClaimExtractorService | `claim-extractor.service.spec.ts` | Claim parsing, substantive word extraction |
| EntailmentCheckerService | `entailment-checker.service.spec.ts` | Passage finding, entailment assessment |
| SUScoreCalculatorService | `suscore-calculator.service.spec.ts` | Score calculation, word weighting |
| ConfidenceAggregatorService | `confidence-aggregator.service.spec.ts` | Aggregation, level determination |
| WorkingMemoryService | `working-memory.service.spec.ts` | CRUD operations, context generation |

### Integration Tests

| Test | Description |
|------|-------------|
| Reasoning flow | Test thought→action→observation→conclusion flow |
| Confidence pipeline | Test full claim extraction through aggregation |
| SSE events | Test new event types are emitted correctly |

### E2E Tests

| Test | Description |
|------|-------------|
| Research with reasoning | Verify reasoning traces appear in UI |
| Confidence display | Verify confidence scores render correctly |

---

## Definition of Done

### Task 1: ReAct Reasoning Traces
- [ ] ReasoningTraceService implemented and tested
- [ ] PlannerService emits reasoning traces
- [ ] Tool execution wrapped with reasoning traces
- [ ] SSE events for reasoning implemented
- [ ] Frontend ReasoningTraceComponent created
- [ ] Integration tests pass

### Task 2: Confidence Scoring
- [ ] ClaimExtractorService implemented and tested
- [ ] EntailmentCheckerService implemented and tested
- [ ] SUScoreCalculatorService implemented and tested
- [ ] ConfidenceAggregatorService implemented and tested
- [ ] ConfidenceScoringService orchestrator implemented
- [ ] SSE events for confidence implemented
- [ ] Frontend ConfidenceDisplayComponent created
- [ ] Unit tests pass (>80% coverage)

### Task 3: Working Memory
- [ ] WorkingMemoryService implemented and tested
- [ ] Orchestrator integrates working memory
- [ ] Context generation works correctly
- [ ] Memory cleanup on completion
- [ ] Unit tests pass

### Task 4-6: Integration
- [ ] All modules registered correctly
- [ ] SSE stream handles new events
- [ ] Frontend displays new components
- [ ] Full E2E test passes
- [ ] Documentation updated

---

## Estimated Effort

| Task | Backend | Frontend | Testing | Total |
|------|---------|----------|---------|-------|
| 1. ReAct Traces | 8h | 4h | 4h | 16h |
| 2. Confidence Scoring | 16h | 6h | 8h | 30h |
| 3. Working Memory | 6h | 0h | 4h | 10h |
| 4-6. Integration | 4h | 4h | 4h | 12h |
| **Total** | **34h** | **14h** | **20h** | **68h** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM claim extraction inconsistent | Add validation and retry logic |
| Entailment checking slow | Implement caching, batch processing |
| Too many SSE events | Add throttling, aggregate events |
| Working memory grows unbounded | Implement size limits, cleanup |
