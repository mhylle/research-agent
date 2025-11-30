import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  ResearchResultEntity,
  ResearchSource,
  ResearchMetadata,
} from './entities/research-result.entity';

export interface SaveResearchResultDto {
  logId: string;
  planId: string;
  query: string;
  answer: string;
  sources: ResearchSource[];
  metadata: ResearchMetadata;
}

@Injectable()
export class ResearchResultService {
  constructor(
    @InjectRepository(ResearchResultEntity)
    private resultRepository: Repository<ResearchResultEntity>,
  ) {}

  async save(dto: SaveResearchResultDto): Promise<ResearchResultEntity> {
    const entity = this.resultRepository.create({
      id: randomUUID(),
      logId: dto.logId,
      planId: dto.planId,
      query: dto.query,
      answer: dto.answer,
      sources: dto.sources,
      metadata: dto.metadata,
    });

    return this.resultRepository.save(entity);
  }

  async findByLogId(logId: string): Promise<ResearchResultEntity | null> {
    return this.resultRepository.findOne({ where: { logId } });
  }

  async findById(id: string): Promise<ResearchResultEntity | null> {
    return this.resultRepository.findOne({ where: { id } });
  }

  async getByLogId(logId: string): Promise<ResearchResultEntity> {
    const result = await this.findByLogId(logId);
    if (!result) {
      throw new NotFoundException(
        `Research result not found for logId: ${logId}`,
      );
    }
    return result;
  }

  async findAll(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ results: ResearchResultEntity[]; total: number }> {
    const [results, total] = await this.resultRepository.findAndCount({
      order: { createdAt: 'DESC' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    });

    return { results, total };
  }
}
