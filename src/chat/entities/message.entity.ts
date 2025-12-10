import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { v4 as uuid } from 'uuid';
import { ConversationEntity } from './conversation.entity';
import type { MessageOptions } from '../interfaces/message-options.interface';
import type { Citation } from '../interfaces/citation.interface';

@Entity('messages')
export class MessageEntity {
  @PrimaryColumn('uuid')
  id: string = uuid();

  @Column('uuid')
  @Index()
  conversationId: string;

  @Column('varchar', { length: 20 })
  role: 'user' | 'assistant' | 'system';

  @Column('text')
  content: string;

  @Column('simple-json')
  messageOptions: MessageOptions;

  @Column('uuid', { nullable: true })
  researchLogId: string | null;

  @Column('simple-json', { nullable: true })
  citations: Citation[] | null;

  @Column('int', { default: 0 })
  tokenCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column('timestamp', { nullable: true })
  editedAt: Date | null;

  @ManyToOne(() => ConversationEntity, (conversation) => conversation.messages)
  @JoinColumn({ name: 'conversationId' })
  conversation: ConversationEntity;
}
