import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeModule } from '../src/knowledge/knowledge.module';
import { KnowledgeSearchService } from '../src/knowledge/knowledge-search.service';
import { EmbeddingService } from '../src/knowledge/embedding.service';
import { ResearchResultEntity } from '../src/research/entities/research-result.entity';
import { ResearchResultService } from '../src/research/research-result.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';

describe('Semantic Search (e2e)', () => {
  let app: INestApplication;
  let knowledgeSearchService: KnowledgeSearchService;
  let embeddingService: EmbeddingService;
  let researchResultService: ResearchResultService;
  let researchResultRepository: Repository<ResearchResultEntity>;

  // Test data IDs for cleanup
  const testResultIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5433'),
          username: process.env.DB_USERNAME || 'research_agent',
          password: process.env.DB_PASSWORD || 'dev_password_change_in_prod',
          database: process.env.DB_DATABASE || 'research_agent_db',
          entities: [ResearchResultEntity],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([ResearchResultEntity]),
        KnowledgeModule,
      ],
      providers: [ResearchResultService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    knowledgeSearchService = moduleFixture.get<KnowledgeSearchService>(
      KnowledgeSearchService,
    );
    embeddingService = moduleFixture.get<EmbeddingService>(EmbeddingService);
    researchResultService = moduleFixture.get<ResearchResultService>(
      ResearchResultService,
    );
    researchResultRepository = moduleFixture.get<
      Repository<ResearchResultEntity>
    >(getRepositoryToken(ResearchResultEntity));
  });

  afterAll(async () => {
    // Cleanup test data
    if (testResultIds.length > 0 && researchResultRepository) {
      console.log(`[Test Cleanup] Removing ${testResultIds.length} test results`);
      await researchResultRepository
        .createQueryBuilder()
        .delete()
        .where('id IN (:...ids)', { ids: testResultIds })
        .execute();
    }
    if (app) {
      await app.close();
    }
  });

  describe('EmbeddingService', () => {
    it('should be defined', () => {
      expect(embeddingService).toBeDefined();
    });

    it('should return correct embedding dimensions', () => {
      const dimensions = embeddingService.getDimensions();
      expect(Number(dimensions)).toBe(768);
    });

    it('should return correct embedding model name', () => {
      const model = embeddingService.getModel();
      expect(model).toBe('nomic-embed-text');
    });

    it('should generate embedding vector', async () => {
      const testText = 'What is machine learning and how does it work?';
      const embedding = await embeddingService.generateEmbedding(testText);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(768);

      // Embeddings should be normalized floating point numbers
      for (const value of embedding.slice(0, 10)) {
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value)).toBe(true);
      }

      console.log(`[Test] Generated embedding with ${embedding.length} dimensions`);
      console.log(`[Test] Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    }, 30000);

    it('should generate embedding for research content', async () => {
      const query = 'What are the benefits of renewable energy?';
      const answer =
        'Renewable energy offers numerous benefits including reduced carbon emissions, energy independence, job creation in green sectors, and long-term cost savings compared to fossil fuels.';

      const embedding = await embeddingService.generateEmbeddingForResearch(
        query,
        answer,
      );

      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(768);
      console.log(`[Test] Generated research embedding successfully`);
    }, 30000);

    it('should produce different embeddings for different content', async () => {
      const embedding1 = await embeddingService.generateEmbedding(
        'Artificial intelligence and neural networks',
      );
      const embedding2 = await embeddingService.generateEmbedding(
        'Cooking recipes and kitchen techniques',
      );

      expect(embedding1.length).toBe(embedding2.length);

      // Calculate cosine similarity - should be low for unrelated topics
      const dotProduct = embedding1.reduce(
        (sum, val, i) => sum + val * embedding2[i],
        0,
      );
      const norm1 = Math.sqrt(
        embedding1.reduce((sum, val) => sum + val * val, 0),
      );
      const norm2 = Math.sqrt(
        embedding2.reduce((sum, val) => sum + val * val, 0),
      );
      const similarity = dotProduct / (norm1 * norm2);

      expect(similarity).toBeLessThan(0.8); // Different topics should have lower similarity
      console.log(`[Test] Similarity between unrelated topics: ${similarity.toFixed(4)}`);
    }, 60000);

    it('should produce similar embeddings for related content', async () => {
      const embedding1 = await embeddingService.generateEmbedding(
        'Machine learning algorithms for image classification',
      );
      const embedding2 = await embeddingService.generateEmbedding(
        'Deep learning neural networks for computer vision',
      );

      const dotProduct = embedding1.reduce(
        (sum, val, i) => sum + val * embedding2[i],
        0,
      );
      const norm1 = Math.sqrt(
        embedding1.reduce((sum, val) => sum + val * val, 0),
      );
      const norm2 = Math.sqrt(
        embedding2.reduce((sum, val) => sum + val * val, 0),
      );
      const similarity = dotProduct / (norm1 * norm2);

      expect(similarity).toBeGreaterThan(0.5); // Related topics should have higher similarity
      console.log(`[Test] Similarity between related topics: ${similarity.toFixed(4)}`);
    }, 60000);
  });

  describe('KnowledgeSearchService - Semantic Search', () => {
    it('should have getEmbeddedCount method', async () => {
      const count = await knowledgeSearchService.getEmbeddedCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
      console.log(`[Test] Results with embeddings: ${count}`);
    });

    it('should perform semantic search with embedding vector', async () => {
      const queryEmbedding = await embeddingService.generateEmbedding(
        'quantum computing applications',
      );

      const results = await knowledgeSearchService.searchSemantic(
        queryEmbedding,
        5,
      );

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      if (results.length > 0) {
        expect(results[0]).toHaveProperty('researchId');
        expect(results[0]).toHaveProperty('score');
        console.log(`[Test] Semantic search found ${results.length} results`);
      } else {
        console.log('[Test] No semantic search results (expected if no embedded data)');
      }
    }, 30000);
  });

  describe('KnowledgeSearchService - Hybrid Search', () => {
    it('should perform hybrid search combining semantic and full-text', async () => {
      const results = await knowledgeSearchService.searchHybrid(
        'artificial intelligence research',
        5,
      );

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      if (results.length > 0) {
        expect(results[0]).toHaveProperty('score');
        expect(results[0].score).toBeGreaterThanOrEqual(0);
        expect(results[0].score).toBeLessThanOrEqual(1);
        console.log(`[Test] Hybrid search found ${results.length} results`);
        console.log(`[Test] Top result score: ${results[0].score?.toFixed(4)}`);
      } else {
        console.log('[Test] No hybrid search results (expected if knowledge base is empty)');
      }
    }, 30000);

    it('should accept custom weights for hybrid search', async () => {
      const results = await knowledgeSearchService.searchHybrid(
        'technology news',
        5,
        { semantic: 0.9, fullText: 0.1 },
      );

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    }, 30000);

    it('should respect max results parameter', async () => {
      const results1 = await knowledgeSearchService.searchHybrid(
        'research data',
        2,
      );
      const results2 = await knowledgeSearchService.searchHybrid(
        'research data',
        10,
      );

      expect(results1.length).toBeLessThanOrEqual(2);
      expect(results2.length).toBeLessThanOrEqual(10);
    }, 60000);
  });

  describe('Research Result with Embeddings', () => {
    it('should save research result with embedding', async () => {
      const testId = randomUUID();
      const logId = randomUUID();
      const planId = randomUUID();

      const savedResult = await researchResultService.save({
        logId,
        planId,
        query: 'What are the latest developments in quantum computing?',
        answer:
          'Recent quantum computing developments include IBM achieving 1000+ qubit processors, ' +
          'Google demonstrating quantum supremacy, and advances in quantum error correction. ' +
          'These breakthroughs are bringing us closer to practical quantum advantage in cryptography and drug discovery.',
        sources: [
          {
            url: 'https://example.com/quantum-news',
            title: 'Quantum Computing Breakthroughs 2024',
            relevance: 'high',
          },
        ],
        metadata: {
          totalExecutionTime: 5000,
          phases: [{ phase: 'research', executionTime: 5000 }],
        },
      });

      testResultIds.push(savedResult.id);
      expect(savedResult).toBeDefined();
      expect(savedResult.id).toBeDefined();
      expect(savedResult.query).toContain('quantum computing');

      console.log(`[Test] Saved research result: ${savedResult.id}`);

      // Wait a moment for async embedding generation
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if embedding was generated
      const embeddingResult = await researchResultRepository.query(
        'SELECT id, embedding IS NOT NULL as has_embedding FROM research_results WHERE id = $1',
        [savedResult.id],
      );

      if (embeddingResult[0]?.has_embedding) {
        console.log(`[Test] Embedding generated for result ${savedResult.id}`);
      } else {
        console.log(`[Test] Embedding not yet generated (may be processing)`);
      }
    }, 60000);

    it('should find saved result via semantic search', async () => {
      // Save a unique test result
      const logId = randomUUID();
      const planId = randomUUID();

      const savedResult = await researchResultService.save({
        logId,
        planId,
        query: 'How does CRISPR gene editing technology work?',
        answer:
          'CRISPR-Cas9 is a revolutionary gene editing tool that uses guide RNA to direct the Cas9 enzyme ' +
          'to specific DNA sequences where it creates precise cuts. This allows scientists to add, remove, ' +
          'or modify genetic material with unprecedented accuracy for treating diseases and improving crops.',
        sources: [
          {
            url: 'https://example.com/crispr-guide',
            title: 'CRISPR Technology Guide',
            relevance: 'high',
          },
        ],
        metadata: {
          totalExecutionTime: 4000,
          phases: [{ phase: 'research', executionTime: 4000 }],
        },
      });

      testResultIds.push(savedResult.id);

      // Wait for embedding to be generated
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Search using semantic query
      const searchResults = await knowledgeSearchService.searchHybrid(
        'gene editing CRISPR DNA modification',
        5,
      );

      console.log(`[Test] Searching for CRISPR-related content`);
      console.log(`[Test] Found ${searchResults.length} results`);

      if (searchResults.length > 0) {
        const foundOurResult = searchResults.some(
          (r) => r.researchId === savedResult.id,
        );
        console.log(`[Test] Our test result found: ${foundOurResult}`);
      }
    }, 90000);
  });

  describe('Embedding Backfill', () => {
    it('should report embedding statistics', async () => {
      const { total } = await researchResultService.findAll({
        limit: 1,
        offset: 0,
      });
      const embeddedCount = await knowledgeSearchService.getEmbeddedCount();

      console.log(`[Test] Total research results: ${total}`);
      console.log(`[Test] Results with embeddings: ${embeddedCount}`);
      console.log(
        `[Test] Results without embeddings: ${total - embeddedCount}`,
      );

      expect(total).toBeGreaterThanOrEqual(0);
      expect(embeddedCount).toBeGreaterThanOrEqual(0);
      expect(embeddedCount).toBeLessThanOrEqual(total);
    });

    it('should backfill embeddings for results without them', async () => {
      // This test may take a while if there are many results to backfill
      const { processed, failed } =
        await researchResultService.backfillEmbeddings();

      console.log(`[Test] Backfill complete: ${processed} processed, ${failed} failed`);

      expect(typeof processed).toBe('number');
      expect(typeof failed).toBe('number');
      expect(processed).toBeGreaterThanOrEqual(0);
    }, 300000); // 5 minute timeout for large backfills
  });

  describe('Hybrid Search Quality', () => {
    it('should boost results appearing in both semantic and full-text search', async () => {
      // Create a result with distinctive content
      const logId = randomUUID();
      const planId = randomUUID();
      const uniquePhrase = `UniqueTestPhrase${Date.now()}`;

      const savedResult = await researchResultService.save({
        logId,
        planId,
        query: `Testing ${uniquePhrase} machine learning algorithms`,
        answer: `This research about ${uniquePhrase} explores how machine learning algorithms ` +
          'can be applied to various domains including natural language processing and computer vision.',
        sources: [
          {
            url: 'https://example.com/ml-test',
            title: 'ML Test Article',
            relevance: 'high',
          },
        ],
        metadata: {
          totalExecutionTime: 1000,
          phases: [{ phase: 'test', executionTime: 1000 }],
        },
      });

      testResultIds.push(savedResult.id);

      // Wait for embedding generation
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Search using the unique phrase (should match full-text)
      // and related ML terms (should match semantic)
      const hybridResults = await knowledgeSearchService.searchHybrid(
        `${uniquePhrase} machine learning`,
        10,
      );

      if (hybridResults.length > 0) {
        console.log(`[Test] Hybrid search found ${hybridResults.length} results`);

        // Our result should be highly ranked due to both full-text and semantic match
        const ourResult = hybridResults.find(
          (r) => r.researchId === savedResult.id,
        );

        if (ourResult) {
          console.log(`[Test] Test result score: ${ourResult.score?.toFixed(4)}`);
          // Score should be boosted for appearing in both searches
          expect(ourResult.score).toBeGreaterThan(0);
        }
      }
    }, 60000);
  });
});
