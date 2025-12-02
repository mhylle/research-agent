import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchResultEntity } from '../research/entities/research-result.entity';
import { KnowledgeSearchService } from './knowledge-search.service';
import { EmbeddingService } from './embedding.service';

@Module({
  imports: [TypeOrmModule.forFeature([ResearchResultEntity])],
  providers: [KnowledgeSearchService, EmbeddingService],
  exports: [KnowledgeSearchService, EmbeddingService],
})
export class KnowledgeModule {}
