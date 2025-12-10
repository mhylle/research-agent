import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { ConversationController } from './conversation.controller';
import { ChatStreamController } from './chat-stream.controller';
import { ConversationService } from './services/conversation.service';
import { ConversationContextService } from './services/conversation-context.service';
import { ChatOrchestratorService } from './services/chat-orchestrator.service';
import { ChatResearchService } from './services/chat-research.service';
import { ResearchSuggestionService } from './services/research-suggestion.service';
import { LLMModule } from '../llm/llm.module';
import { ResearchModule } from '../research/research.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity]),
    LLMModule,
    ResearchModule,
  ],
  controllers: [ConversationController, ChatStreamController],
  providers: [
    ConversationService,
    ConversationContextService,
    ChatOrchestratorService,
    ChatResearchService,
    ResearchSuggestionService,
  ],
  exports: [
    ConversationService,
    ConversationContextService,
    ChatOrchestratorService,
    ChatResearchService,
    ResearchSuggestionService,
  ],
})
export class ChatModule {}
