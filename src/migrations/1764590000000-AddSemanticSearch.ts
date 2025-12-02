import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSemanticSearch1764590000000 implements MigrationInterface {
  name = 'AddSemanticSearch1764590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // Add embedding column for semantic search (768 dimensions for nomic-embed-text)
    await queryRunner.query(`
      ALTER TABLE "research_results"
      ADD COLUMN IF NOT EXISTS "embedding" vector(768)
    `);

    // Create HNSW index for fast approximate nearest neighbor search
    // Using cosine distance (vector_cosine_ops) for normalized embeddings
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_results_embedding"
      ON "research_results" USING hnsw ("embedding" vector_cosine_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_research_results_embedding"
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE "research_results"
      DROP COLUMN IF EXISTS "embedding"
    `);

    // Note: We don't drop the vector extension as other tables might use it
  }
}
