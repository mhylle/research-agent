import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LLMModule } from '../llm/llm.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LoggingModule } from '../logging/logging.module';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './services/evaluation.service';
import { EvaluationRecordEntity } from './entities/evaluation-record.entity';
import { PanelEvaluatorService } from './services/panel-evaluator.service';
import { ScoreAggregatorService } from './services/score-aggregator.service';
import { RetrievalEvaluatorService } from './services/retrieval-evaluator.service';
import { AnswerEvaluatorService } from './services/answer-evaluator.service';
import { EscalationHandlerService } from './services/escalation-handler.service';
import { PlanEvaluationOrchestratorService } from './services/plan-evaluation-orchestrator.service';
import { ResultClassifierService } from './services/result-classifier.service';
import { ClaimExtractorService } from './services/claim-extractor.service';
import { EntailmentCheckerService } from './services/entailment-checker.service';
import { SUScoreCalculatorService } from './services/suscore-calculator.service';
import { ConfidenceAggregatorService } from './services/confidence-aggregator.service';
import { ConfidenceScoringService } from './services/confidence-scoring.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EvaluationRecordEntity]),
    LLMModule,
    KnowledgeModule,
    LoggingModule,
  ],
  controllers: [EvaluationController],
  providers: [
    EvaluationService,
    PanelEvaluatorService,
    ScoreAggregatorService,
    RetrievalEvaluatorService,
    AnswerEvaluatorService,
    EscalationHandlerService,
    PlanEvaluationOrchestratorService,
    ResultClassifierService,
    ClaimExtractorService,
    EntailmentCheckerService,
    SUScoreCalculatorService,
    ConfidenceAggregatorService,
    ConfidenceScoringService,
  ],
  exports: [
    EvaluationService,
    PanelEvaluatorService,
    ScoreAggregatorService,
    RetrievalEvaluatorService,
    AnswerEvaluatorService,
    EscalationHandlerService,
    PlanEvaluationOrchestratorService,
    ResultClassifierService,
    ClaimExtractorService,
    EntailmentCheckerService,
    SUScoreCalculatorService,
    ConfidenceAggregatorService,
    ConfidenceScoringService,
  ],
})
export class EvaluationModule {}
