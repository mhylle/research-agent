import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { LogEntryEntity } from './logging/entities/log-entry.entity';
import { ResearchResultEntity } from './research/entities/research-result.entity';
import { EvaluationRecordEntity } from './evaluation/entities/evaluation-record.entity';
import { ConversationEntity } from './chat/entities/conversation.entity';
import { MessageEntity } from './chat/entities/message.entity';

config(); // Load .env file

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  username: process.env.DB_USERNAME || 'research_agent',
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_DATABASE || 'research_agent_db',
  entities: [
    LogEntryEntity,
    ResearchResultEntity,
    EvaluationRecordEntity,
    ConversationEntity,
    MessageEntity,
  ],
  migrations: [__dirname + '/migrations/*.ts'],
  logging: process.env.NODE_ENV === 'development',
});
