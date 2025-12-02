import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeModule } from '../src/knowledge/knowledge.module';
import { KnowledgeSearchService } from '../src/knowledge/knowledge-search.service';
import { KnowledgeSearchProvider } from '../src/tools/providers/knowledge-search.provider';
import { ResearchResultEntity } from '../src/research/entities/research-result.entity';
import { LoggingModule } from '../src/logging/logging.module';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';

describe('Knowledge Search (e2e)', () => {
  let app: INestApplication;
  let knowledgeSearchService: KnowledgeSearchService;
  let knowledgeSearchProvider: KnowledgeSearchProvider;
  let researchResultRepository: Repository<ResearchResultEntity>;

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
        KnowledgeModule,
        LoggingModule,
      ],
      providers: [KnowledgeSearchProvider],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    knowledgeSearchService = moduleFixture.get<KnowledgeSearchService>(
      KnowledgeSearchService,
    );
    knowledgeSearchProvider = moduleFixture.get<KnowledgeSearchProvider>(
      KnowledgeSearchProvider,
    );
    researchResultRepository = moduleFixture.get<
      Repository<ResearchResultEntity>
    >(getRepositoryToken(ResearchResultEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('KnowledgeSearchService', () => {
    it('should be defined', () => {
      expect(knowledgeSearchService).toBeDefined();
    });

    it('should return empty array when no matching results', async () => {
      const results = await knowledgeSearchService.searchPriorResearch(
        'completely_unique_query_that_does_not_exist_xyz123',
        5,
      );
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should return searchable count', async () => {
      const count = await knowledgeSearchService.getSearchableCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
      console.log(`[Test] Knowledge base has ${count} searchable research results`);
    });
  });

  describe('KnowledgeSearchProvider', () => {
    it('should be defined', () => {
      expect(knowledgeSearchProvider).toBeDefined();
    });

    it('should have correct tool definition', () => {
      const definition = knowledgeSearchProvider.definition;
      expect(definition.function.name).toBe('knowledge_search');
      expect(definition.function.description).toContain('internal knowledge base');
      expect(definition.function.parameters.required).toContain('query');
    });

    it('should not require API key', () => {
      expect(knowledgeSearchProvider.requiresApiKey).toBe(false);
    });

    it('should validate query parameter', async () => {
      await expect(
        knowledgeSearchProvider.execute({ query: '' }),
      ).rejects.toThrow('query must be a non-empty string');

      await expect(
        knowledgeSearchProvider.execute({ query: null }),
      ).rejects.toThrow('query must be a non-empty string');
    });

    it('should validate max_results parameter type', async () => {
      await expect(
        knowledgeSearchProvider.execute({
          query: 'test query',
          max_results: 'five',
        }),
      ).rejects.toThrow('max_results must be a number');
    });

    it('should execute search and return SearchResult array', async () => {
      const results = await knowledgeSearchProvider.execute({
        query: 'quantum physics news',
        max_results: 3,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      // If there are results, verify the structure
      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('content');
        expect(result.url).toMatch(/^knowledge:\/\/research\//);
        console.log(`[Test] Found ${results.length} prior research results`);
        console.log(`[Test] First result: "${result.title}" (score: ${result.score})`);
      } else {
        console.log('[Test] No prior research found (expected if no research has been done yet)');
      }
    });
  });

  describe('Integration with Research Results', () => {
    let testResultId: string | null = null;

    it('should find research results by relevant query', async () => {
      // First, check if there are any existing research results
      const existingResults = await researchResultRepository.find({
        take: 5,
        order: { createdAt: 'DESC' },
      });

      if (existingResults.length > 0) {
        console.log(`[Test] Found ${existingResults.length} existing research results`);
        console.log('[Test] Sample queries:', existingResults.map((r) => r.query).slice(0, 3));

        // Search for terms from one of the existing results
        const sampleResult = existingResults[0];
        const searchTerms = sampleResult.query.split(' ').slice(0, 3).join(' ');

        const searchResults = await knowledgeSearchProvider.execute({
          query: searchTerms,
          max_results: 5,
        });

        console.log(`[Test] Searched for: "${searchTerms}"`);
        console.log(`[Test] Found ${searchResults.length} matching results`);

        if (searchResults.length > 0) {
          expect(searchResults[0]).toHaveProperty('url');
          expect(searchResults[0].url).toMatch(/^knowledge:\/\/research\//);
        }
      } else {
        console.log('[Test] No existing research results to test against');
      }
    });

    it('should respect max_results parameter', async () => {
      const results1 = await knowledgeSearchProvider.execute({
        query: 'research news technology',
        max_results: 2,
      });

      const results2 = await knowledgeSearchProvider.execute({
        query: 'research news technology',
        max_results: 10,
      });

      expect(results1.length).toBeLessThanOrEqual(2);
      expect(results2.length).toBeLessThanOrEqual(10);
    });

    it('should return results with normalized scores', async () => {
      const results = await knowledgeSearchService.searchPriorResearch(
        'news research',
        5,
      );

      for (const result of results) {
        if (result.score !== undefined) {
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
