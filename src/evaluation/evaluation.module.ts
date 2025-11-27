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
