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
