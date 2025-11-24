/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { LogEntryData } from '../interfaces/log-entry.interface';

@Entity('log_entries')
export class LogEntryEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  logId: string;

  @Column('timestamp with time zone')
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

  @Column('jsonb')
  data: LogEntryData;
}
