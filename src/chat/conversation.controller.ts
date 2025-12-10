import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  NotFoundException,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ConversationService } from './services/conversation.service';
import { ChatOrchestratorService } from './services/chat-orchestrator.service';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';

@Controller('api/conversations')
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly chatOrchestratorService: ChatOrchestratorService,
  ) {}

  @Post()
  async createConversation(
    @Body(new ValidationPipe({ transform: true }))
    dto: CreateConversationDto,
  ): Promise<ConversationEntity> {
    return this.conversationService.createConversation(dto);
  }

  @Get()
  async listConversations(
    @Query('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ): Promise<{
    data: ConversationEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const options: ListConversationsDto = {
      page,
      limit,
      search,
    };
    return this.conversationService.listConversations(userId, options);
  }

  @Get('search')
  async searchConversations(
    @Query('userId') userId: string,
    @Query('q') query: string,
  ): Promise<ConversationEntity[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.conversationService.searchConversations(userId, query);
  }

  @Get(':id')
  async getConversation(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationEntity> {
    try {
      const conversation = await this.conversationService.getConversation(id);
      if (!conversation) {
        throw new NotFoundException(`Conversation ${id} not found`);
      }
      return conversation;
    } catch (error) {
      // Handle invalid UUID format (PostgreSQL error code 22P02)
      if (
        error instanceof QueryFailedError &&
        'code' in error &&
        error.code === '22P02'
      ) {
        throw new NotFoundException(`Invalid conversation ID format: ${id}`);
      }
      throw error;
    }
  }

  @Patch(':id')
  async updateConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ transform: true }))
    dto: UpdateConversationDto,
  ): Promise<ConversationEntity> {
    try {
      return await this.conversationService.updateConversation(id, dto);
    } catch (error) {
      // Handle invalid UUID format (PostgreSQL error code 22P02)
      if (
        error instanceof QueryFailedError &&
        'code' in error &&
        error.code === '22P02'
      ) {
        throw new NotFoundException(`Invalid conversation ID format: ${id}`);
      }
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    try {
      await this.conversationService.deleteConversation(id);
    } catch (error) {
      // Handle invalid UUID format (PostgreSQL error code 22P02)
      if (
        error instanceof QueryFailedError &&
        'code' in error &&
        error.code === '22P02'
      ) {
        throw new NotFoundException(`Invalid conversation ID format: ${id}`);
      }
      throw error;
    }
  }

  @Post(':id/messages')
  async addMessage(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body(new ValidationPipe({ transform: true })) dto: CreateMessageDto,
  ): Promise<MessageEntity> {
    try {
      const message = await this.conversationService.addMessage(
        conversationId,
        dto,
      );

      // If this is an assistant message (placeholder), trigger LLM processing
      if (dto.role === 'assistant') {
        // Fire and forget - don't await
        this.chatOrchestratorService
          .processMessage(conversationId, message.id)
          .catch((error) => {
            // Log error but don't block the response
            console.error('Error processing assistant message:', error);
          });
      }

      return message;
    } catch (error) {
      // Handle invalid UUID format (PostgreSQL error code 22P02)
      if (
        error instanceof QueryFailedError &&
        'code' in error &&
        error.code === '22P02'
      ) {
        throw new NotFoundException(
          `Invalid conversation ID format: ${conversationId}`,
        );
      }
      throw error;
    }
  }

  @Patch('messages/:id')
  async updateMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('content') content: string,
  ): Promise<MessageEntity> {
    try {
      if (!content || content.trim().length === 0) {
        throw new NotFoundException('Content is required');
      }
      return await this.conversationService.updateMessage(id, content);
    } catch (error) {
      // Handle invalid UUID format (PostgreSQL error code 22P02)
      if (
        error instanceof QueryFailedError &&
        'code' in error &&
        error.code === '22P02'
      ) {
        throw new NotFoundException(`Invalid message ID format: ${id}`);
      }
      throw error;
    }
  }
}
