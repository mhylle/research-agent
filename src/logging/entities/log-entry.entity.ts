import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import type { LogEntryData } from '../interfaces/log-entry.interface';

@Entity('log_entries')
export class LogEntryEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  logId: string;

  @Column('datetime')
  @Index()
  timestamp: Date;

  @Column('varchar', { length: 50 })
  @Index()
  eventType: string;

  @Column('uuid', { nullable: true })
  planId?: string;

  @Column('uuid', { nullable: true })
  phaseId?: string;

  @Column('uuid', { nullable: true })
  stepId?: string;

  @Column('simple-json')
  data: LogEntryData;
}
