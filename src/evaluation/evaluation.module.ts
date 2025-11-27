import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LLMModule } from '../llm/llm.module';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './services/evaluation.service';
import { EvaluationRecordEntity } from './entities/evaluation-record.entity';
import { PanelEvaluatorService } from './services/panel-evaluator.service';
import { ScoreAggregatorService } from './services/score-aggregator.service';
import { RetrievalEvaluatorService } from './services/retrieval-evaluator.service';
import { AnswerEvaluatorService } from './services/answer-evaluator.service';
import { EscalationHandlerService } from './services/escalation-handler.service';
import { PlanEvaluationOrchestratorService } from './services/plan-evaluation-orchestrator.service';

@Module({
  imports: [TypeOrmModule.forFeature([EvaluationRecordEntity]), LLMModule],
  controllers: [EvaluationController],
  providers: [
    EvaluationService,
    PanelEvaluatorService,
    ScoreAggregatorService,
    RetrievalEvaluatorService,
    AnswerEvaluatorService,
    EscalationHandlerService,
    PlanEvaluationOrchestratorService,
  ],
  exports: [
    EvaluationService,
    PanelEvaluatorService,
    ScoreAggregatorService,
    RetrievalEvaluatorService,
    AnswerEvaluatorService,
    EscalationHandlerService,
    PlanEvaluationOrchestratorService,
  ],
})
export class EvaluationModule {}
