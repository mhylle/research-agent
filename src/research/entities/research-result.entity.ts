import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';
import type { ConfidenceResult } from '../../evaluation/interfaces/confidence.interface';

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

  @Column('simple-json', { nullable: true })
  confidence?: ConfidenceResult;

  @CreateDateColumn()
  createdAt: Date;

  // Vector embedding for semantic search (768 dimensions for nomic-embed-text)
  // Using 'text' type as TypeORM doesn't have native pgvector support
  // The migration creates the actual vector(768) column
  @Column({ type: 'text', nullable: true, select: false })
  embedding?: string;
}
