import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  ResearchResultEntity,
  ResearchSource,
  ResearchMetadata,
} from './entities/research-result.entity';
import { EmbeddingService } from '../knowledge/embedding.service';

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
  private readonly logger = new Logger(ResearchResultService.name);

  constructor(
    @InjectRepository(ResearchResultEntity)
    private resultRepository: Repository<ResearchResultEntity>,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async save(dto: SaveResearchResultDto): Promise<ResearchResultEntity> {
    const id = randomUUID();

    // Generate embedding for semantic search
    let embeddingStr: string | undefined;
    try {
      const embedding =
        await this.embeddingService.generateEmbeddingForResearch(
          dto.query,
          dto.answer,
        );
      embeddingStr = `[${embedding.join(',')}]`;
      this.logger.debug(`Generated embedding for research result ${id}`);
    } catch (error) {
      this.logger.warn(
        `Failed to generate embedding for research result ${id}: ${error}`,
      );
      // Continue without embedding - can be backfilled later
    }

    const entity = this.resultRepository.create({
      id,
      logId: dto.logId,
      planId: dto.planId,
      query: dto.query,
      answer: dto.answer,
      sources: dto.sources,
      metadata: dto.metadata,
    });

    // Save entity first
    const savedEntity = await this.resultRepository.save(entity);

    // Update embedding separately using raw query (TypeORM doesn't support vector type)
    if (embeddingStr) {
      await this.resultRepository.query(
        `UPDATE research_results SET embedding = $1::vector WHERE id = $2`,
        [embeddingStr, id],
      );
    }

    return savedEntity;
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

  /**
   * Backfill embeddings for existing research results that don't have them
   * @returns Number of results processed
   */
  async backfillEmbeddings(): Promise<{ processed: number; failed: number }> {
    this.logger.log(
      'Starting embedding backfill for existing research results',
    );

    // Find all results without embeddings
    const resultsWithoutEmbeddings = await this.resultRepository.query(`
      SELECT id, query, answer
      FROM research_results
      WHERE embedding IS NULL
      ORDER BY "createdAt" DESC
    `);

    this.logger.log(
      `Found ${resultsWithoutEmbeddings.length} results without embeddings`,
    );

    let processed = 0;
    let failed = 0;

    for (const result of resultsWithoutEmbeddings) {
      try {
        const embedding =
          await this.embeddingService.generateEmbeddingForResearch(
            result.query,
            result.answer,
          );
        const embeddingStr = `[${embedding.join(',')}]`;

        await this.resultRepository.query(
          `UPDATE research_results SET embedding = $1::vector WHERE id = $2`,
          [embeddingStr, result.id],
        );

        processed++;
        this.logger.debug(
          `Backfilled embedding for ${result.id} (${processed}/${resultsWithoutEmbeddings.length})`,
        );
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to backfill embedding for ${result.id}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Embedding backfill complete: ${processed} processed, ${failed} failed`,
    );

    return { processed, failed };
  }
}
