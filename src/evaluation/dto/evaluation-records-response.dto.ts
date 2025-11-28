import { EvaluationRecordEntity } from '../entities/evaluation-record.entity';

export class EvaluationRecordsResponseDto {
  records: EvaluationRecordEntity[];
  total: number;
  page: number;
  pages: number;
}
