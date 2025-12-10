import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ConversationEntity } from '../entities/conversation.entity';
import { MessageEntity } from '../entities/message.entity';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { UpdateConversationDto } from '../dto/update-conversation.dto';
import { CreateMessageDto } from '../dto/create-message.dto';
import { ListConversationsDto } from '../dto/list-conversations.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectRepository(ConversationEntity)
    private conversationRepository: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private messageRepository: Repository<MessageEntity>,
  ) {}

  async createConversation(
    dto: CreateConversationDto,
  ): Promise<ConversationEntity> {
    const conversation = this.conversationRepository.create({
      id: randomUUID(),
      userId: dto.userId,
      title: dto.title || 'New Conversation',
      tokenCount: 0,
    });
    return this.conversationRepository.save(conversation);
  }

  async getConversation(id: string): Promise<ConversationEntity> {
    const conversation = await this.conversationRepository.findOne({
      where: { id },
      relations: ['messages'],
      order: { messages: { createdAt: 'ASC' } },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    return conversation;
  }

  async listConversations(
    userId: string,
    options: ListConversationsDto,
  ): Promise<PaginatedResult<ConversationEntity>> {
    const { page = 1, limit = 20, search } = options;
    const skip = (page - 1) * limit;

    const queryBuilder = this.conversationRepository
      .createQueryBuilder('conversation')
      .where('conversation.userId = :userId', { userId })
      .orderBy('conversation.updatedAt', 'DESC');

    if (search) {
      queryBuilder.andWhere('conversation.title ILIKE :search', {
        search: `%${search}%`,
      });
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateConversation(
    id: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationEntity> {
    const conversation = await this.getConversation(id);
    Object.assign(conversation, dto);
    return this.conversationRepository.save(conversation);
  }

  async deleteConversation(id: string): Promise<void> {
    // Verify conversation exists
    await this.getConversation(id);
    // Delete messages first due to FK constraint
    await this.messageRepository.delete({ conversationId: id });
    await this.conversationRepository.delete(id);
  }

  async addMessage(
    conversationId: string,
    dto: CreateMessageDto,
  ): Promise<MessageEntity> {
    // Verify conversation exists
    await this.getConversation(conversationId);

    const message = this.messageRepository.create({
      id: randomUUID(),
      conversationId,
      role: dto.role,
      content: dto.content,
      messageOptions: dto.messageOptions || { researchEnabled: false },
      tokenCount: 0, // Will be updated after LLM processing
    });

    const savedMessage = await this.messageRepository.save(message);

    // Update conversation's updatedAt timestamp
    await this.conversationRepository.update(conversationId, {});

    return savedMessage;
  }

  async updateMessage(id: string, content: string): Promise<MessageEntity> {
    const message = await this.messageRepository.findOne({ where: { id } });
    if (!message) {
      throw new NotFoundException(`Message ${id} not found`);
    }
    message.content = content;
    message.editedAt = new Date();
    return this.messageRepository.save(message);
  }

  async updateMessageContent(id: string, content: string): Promise<void> {
    const message = await this.messageRepository.findOne({ where: { id } });
    if (!message) {
      throw new NotFoundException(`Message ${id} not found`);
    }
    await this.messageRepository.update(id, { content });
  }

  async searchConversations(
    userId: string,
    query: string,
  ): Promise<ConversationEntity[]> {
    return this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.messages', 'message')
      .where('conversation.userId = :userId', { userId })
      .andWhere(
        '(conversation.title ILIKE :query OR message.content ILIKE :query)',
        { query: `%${query}%` },
      )
      .orderBy('conversation.updatedAt', 'DESC')
      .getMany();
  }

  // Helper methods for research integration
  async linkResearch(messageId: string, logId: string): Promise<void> {
    await this.messageRepository.update(messageId, { researchLogId: logId });
  }

  async updateMessageCitations(
    messageId: string,
    citations: any[],
  ): Promise<void> {
    await this.messageRepository.update(messageId, { citations });
  }

  async updateMessageTokenCount(
    messageId: string,
    tokenCount: number,
  ): Promise<void> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
    });
    if (message) {
      await this.messageRepository.update(messageId, { tokenCount });
      // Update conversation total
      await this.conversationRepository.increment(
        { id: message.conversationId },
        'tokenCount',
        tokenCount,
      );
    }
  }
}
