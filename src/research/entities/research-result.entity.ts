import { Entity, PrimaryColumn, Column, Index, CreateDateColumn } from 'typeorm';

export interface ResearchSource {
  url: string;
  title: string;
  relevance: string;
}

export interface ResearchMetadata {
  totalExecutionTime: number;
  phases: Array<{ phase: string; executionTime: number }>;
}

@Entity('research_results')
export class ResearchResultEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  logId: string;

  @Column('uuid')
  planId: string;

  @Column('text')
  query: string;

  @Column('text')
  answer: string;

  @Column('simple-json')
  sources: ResearchSource[];

  @Column('simple-json')
  metadata: ResearchMetadata;

  @CreateDateColumn()
  createdAt: Date;
}
