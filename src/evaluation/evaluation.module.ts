import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmModule } from '../llm/llm.module';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './services/evaluation.service';
import { EvaluationRecordEntity } from './entities/evaluation-record.entity';
import { PanelEvaluatorService } from './services/panel-evaluator.service';
import { ScoreAggregatorService } from './services/score-aggregator.service';

@Module({
  imports: [TypeOrmModule.forFeature([EvaluationRecordEntity]), LlmModule],
  controllers: [EvaluationController],
  providers: [EvaluationService, PanelEvaluatorService, ScoreAggregatorService],
  exports: [EvaluationService, PanelEvaluatorService, ScoreAggregatorService],
})
export class EvaluationModule {}
