import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullTextSearch1764587500000 implements MigrationInterface {
  name = 'AddFullTextSearch1764587500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add search_vector column for full-text search
    await queryRunner.query(`
      ALTER TABLE "research_results"
      ADD COLUMN IF NOT EXISTS "search_vector" tsvector
    `);

    // Create GIN index for fast full-text search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_research_results_search_vector"
      ON "research_results" USING GIN("search_vector")
    `);

    // Create function to update search vector
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_research_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', COALESCE(NEW.query, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.answer, '')), 'B');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create trigger to auto-update search_vector on insert/update
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS research_search_vector_trigger ON "research_results"
    `);

    await queryRunner.query(`
      CREATE TRIGGER research_search_vector_trigger
      BEFORE INSERT OR UPDATE ON "research_results"
      FOR EACH ROW
      EXECUTE FUNCTION update_research_search_vector()
    `);

    // Update existing rows to populate search_vector
    await queryRunner.query(`
      UPDATE "research_results"
      SET search_vector =
        setweight(to_tsvector('english', COALESCE(query, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(answer, '')), 'B')
      WHERE search_vector IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop trigger
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS research_search_vector_trigger ON "research_results"
    `);

    // Drop function
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_research_search_vector()
    `);

    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_research_results_search_vector"
    `);

    // Drop column
    await queryRunner.query(`
      ALTER TABLE "research_results"
      DROP COLUMN IF EXISTS "search_vector"
    `);
  }
}
