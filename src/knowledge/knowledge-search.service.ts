import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ResearchResultEntity } from '../research/entities/research-result.entity';
import { SearchResult } from '../tools/interfaces/search-result.interface';
import { EmbeddingService } from './embedding.service';

export interface KnowledgeSearchResult extends SearchResult {
  researchId: string;
  originalQuery: string;
  createdAt: Date;
}

export interface HybridSearchWeights {
  semantic: number;
  fullText: number;
}

@Injectable()
export class KnowledgeSearchService {
  private readonly logger = new Logger(KnowledgeSearchService.name);
  private readonly defaultWeights: HybridSearchWeights;

  constructor(
    @InjectRepository(ResearchResultEntity)
    private readonly researchResultRepository: Repository<ResearchResultEntity>,
    private readonly embeddingService: EmbeddingService,
    private readonly configService: ConfigService,
  ) {
    this.defaultWeights = {
      semantic: this.configService.get<number>('SEMANTIC_WEIGHT') || 0.7,
      fullText: this.configService.get<number>('FULLTEXT_WEIGHT') || 0.3,
    };
  }

  /**
   * Search prior research results using PostgreSQL full-text search
   * @param query - The search query
   * @param maxResults - Maximum number of results to return (default: 5)
   * @returns Array of SearchResult from prior research
   */
  async searchPriorResearch(
    query: string,
    maxResults: number = 5,
  ): Promise<KnowledgeSearchResult[]> {
    this.logger.debug(`Searching knowledge base for: "${query}"`);

    // Convert the query to tsquery format
    // Using plainto_tsquery for natural language queries
    const results = await this.researchResultRepository.query(
      `
      SELECT
        id,
        query as original_query,
        answer,
        sources,
        metadata,
        "createdAt",
        ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
      FROM research_results
      WHERE search_vector @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $2
      `,
      [query, maxResults],
    );

    this.logger.debug(`Found ${results.length} prior research results`);

    return results.map((result: any) => this.mapToSearchResult(result));
  }

  /**
   * Search with phrase matching for more precise results
   * @param query - The search query (treated as a phrase)
   * @param maxResults - Maximum number of results to return
   */
  async searchPriorResearchPhrase(
    query: string,
    maxResults: number = 5,
  ): Promise<KnowledgeSearchResult[]> {
    this.logger.debug(`Searching knowledge base (phrase) for: "${query}"`);

    const results = await this.researchResultRepository.query(
      `
      SELECT
        id,
        query as original_query,
        answer,
        sources,
        metadata,
        "createdAt",
        ts_rank(search_vector, phraseto_tsquery('english', $1)) as rank
      FROM research_results
      WHERE search_vector @@ phraseto_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $2
      `,
      [query, maxResults],
    );

    this.logger.debug(`Found ${results.length} prior research results (phrase)`);

    return results.map((result: any) => this.mapToSearchResult(result));
  }

  /**
   * Search with similarity threshold for relevance filtering
   * @param query - The search query
   * @param maxResults - Maximum number of results to return
   * @param minRank - Minimum relevance rank threshold (0-1)
   */
  async searchWithThreshold(
    query: string,
    maxResults: number = 5,
    minRank: number = 0.1,
  ): Promise<KnowledgeSearchResult[]> {
    this.logger.debug(
      `Searching knowledge base with threshold ${minRank} for: "${query}"`,
    );

    const results = await this.researchResultRepository.query(
      `
      SELECT
        id,
        query as original_query,
        answer,
        sources,
        metadata,
        "createdAt",
        ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
      FROM research_results
      WHERE search_vector @@ plainto_tsquery('english', $1)
        AND ts_rank(search_vector, plainto_tsquery('english', $1)) >= $3
      ORDER BY rank DESC
      LIMIT $2
      `,
      [query, maxResults, minRank],
    );

    this.logger.debug(
      `Found ${results.length} prior research results (threshold: ${minRank})`,
    );

    return results.map((result: any) => this.mapToSearchResult(result));
  }

  /**
   * Get total count of searchable research results
   */
  async getSearchableCount(): Promise<number> {
    const result = await this.researchResultRepository.query(
      `SELECT COUNT(*) as count FROM research_results WHERE search_vector IS NOT NULL`,
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  /**
   * Map database result to KnowledgeSearchResult
   */
  private mapToSearchResult(result: any): KnowledgeSearchResult {
    // Truncate answer if too long (keep first 500 chars)
    const truncatedAnswer =
      result.answer.length > 500
        ? result.answer.substring(0, 500) + '...'
        : result.answer;

    // Normalize rank to 0-1 scale (ts_rank can exceed 1)
    const normalizedScore = Math.min(1, Math.max(0, result.rank || 0));

    return {
      title: result.original_query,
      url: `knowledge://research/${result.id}`,
      content: truncatedAnswer,
      score: normalizedScore,
      researchId: result.id,
      originalQuery: result.original_query,
      createdAt: result.createdAt,
    };
  }

  /**
   * Hybrid search combining semantic and full-text search
   * @param query - The search query
   * @param maxResults - Maximum number of results
   * @param weights - Optional custom weights for scoring
   */
  async searchHybrid(
    query: string,
    maxResults: number = 5,
    weights: HybridSearchWeights = this.defaultWeights,
  ): Promise<KnowledgeSearchResult[]> {
    this.logger.debug(
      `Hybrid search for: "${query}" (semantic: ${weights.semantic}, fullText: ${weights.fullText})`,
    );

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Run both searches in parallel (fetch more results to merge)
    const fetchCount = maxResults * 2;
    const [semanticResults, fullTextResults] = await Promise.all([
      this.searchSemantic(queryEmbedding, fetchCount),
      this.searchPriorResearch(query, fetchCount),
    ]);

    // Merge and re-rank results
    const merged = this.mergeResults(
      semanticResults,
      fullTextResults,
      weights,
    );

    this.logger.debug(
      `Hybrid search found ${merged.length} results (semantic: ${semanticResults.length}, fullText: ${fullTextResults.length})`,
    );

    return merged.slice(0, maxResults);
  }

  /**
   * Semantic search using vector similarity (pgvector)
   * @param queryEmbedding - The query embedding vector
   * @param maxResults - Maximum number of results
   */
  async searchSemantic(
    queryEmbedding: number[],
    maxResults: number = 5,
  ): Promise<KnowledgeSearchResult[]> {
    this.logger.debug(`Semantic search with ${queryEmbedding.length}-dim vector`);

    // Convert embedding array to pgvector format
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const results = await this.researchResultRepository.query(
      `
      SELECT
        id,
        query as original_query,
        answer,
        sources,
        metadata,
        "createdAt",
        1 - (embedding <=> $1::vector) as rank
      FROM research_results
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
      `,
      [embeddingStr, maxResults],
    );

    this.logger.debug(`Semantic search found ${results.length} results`);

    return results.map((result: any) => this.mapToSearchResult(result));
  }

  /**
   * Merge results from semantic and full-text search with weighted scoring
   */
  private mergeResults(
    semanticResults: KnowledgeSearchResult[],
    fullTextResults: KnowledgeSearchResult[],
    weights: HybridSearchWeights,
  ): KnowledgeSearchResult[] {
    const resultMap = new Map<string, {
      result: KnowledgeSearchResult;
      semanticScore: number;
      fullTextScore: number;
    }>();

    // Add semantic results
    for (const result of semanticResults) {
      resultMap.set(result.researchId, {
        result,
        semanticScore: result.score || 0,
        fullTextScore: 0,
      });
    }

    // Add/merge full-text results
    for (const result of fullTextResults) {
      const existing = resultMap.get(result.researchId);
      if (existing) {
        // Result found in both - update full-text score
        existing.fullTextScore = result.score || 0;
      } else {
        // New result from full-text only
        resultMap.set(result.researchId, {
          result,
          semanticScore: 0,
          fullTextScore: result.score || 0,
        });
      }
    }

    // Calculate final scores and sort
    const merged = Array.from(resultMap.values()).map((entry) => {
      const finalScore =
        entry.semanticScore * weights.semantic +
        entry.fullTextScore * weights.fullText;

      // Boost results appearing in both searches (indicates high relevance)
      const bothSearchesBoost =
        entry.semanticScore > 0 && entry.fullTextScore > 0 ? 1.1 : 1.0;

      return {
        ...entry.result,
        score: Math.min(1, finalScore * bothSearchesBoost),
      };
    });

    // Sort by final score descending
    merged.sort((a, b) => (b.score || 0) - (a.score || 0));

    return merged;
  }

  /**
   * Get count of results with embeddings
   */
  async getEmbeddedCount(): Promise<number> {
    const result = await this.researchResultRepository.query(
      `SELECT COUNT(*) as count FROM research_results WHERE embedding IS NOT NULL`,
    );
    return parseInt(result[0]?.count || '0', 10);
  }
}
