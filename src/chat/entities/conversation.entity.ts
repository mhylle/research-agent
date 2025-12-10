import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { v4 as uuid } from 'uuid';
import { MessageEntity } from './message.entity';

@Entity('conversations')
export class ConversationEntity {
  @PrimaryColumn('uuid')
  id: string = uuid();

  @Column('varchar', { length: 255 })
  @Index()
  userId: string;

  @Column('text')
  title: string;

  @Column('text', { nullable: true })
  summary: string | null;

  @Column('int', { default: 0 })
  tokenCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => MessageEntity, (message) => message.conversation)
  messages: MessageEntity[];
}
