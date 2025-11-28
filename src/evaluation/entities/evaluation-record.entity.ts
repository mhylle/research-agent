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

  @Column('simple-json')
  planEvaluation: {
    attempts: any[];
    finalScores: Record<string, number>;
    explanations: Record<string, string>;
    passed: boolean;
    totalIterations: number;
    escalatedToLargeModel: boolean;
  };

  @Column('simple-json', { nullable: true })
  retrievalEvaluation: {
    scores: Record<string, number>;
    explanations: Record<string, string>;
    passed: boolean;
    flaggedSevere: boolean;
    sourceDetails: any[];
  };

  @Column('simple-json', { nullable: true })
  answerEvaluation: {
    attempts: any[];
    finalScores: Record<string, number>;
    explanations: Record<string, string>;
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
