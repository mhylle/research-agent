import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatTables1765313375545 implements MigrationInterface {
  name = 'AddChatTables1765313375545';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_research_results_search_vector"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_research_results_embedding"`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "messages" ("id" uuid NOT NULL, "conversationId" uuid NOT NULL, "role" character varying(20) NOT NULL, "content" text NOT NULL, "messageOptions" text NOT NULL, "researchLogId" uuid, "citations" text, "tokenCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "editedAt" TIMESTAMP, CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_e5663ce0c730b2de83445e2fd1" ON "messages" ("conversationId") `,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "conversations" ("id" uuid NOT NULL, "userId" uuid NOT NULL, "title" text NOT NULL, "summary" text, "tokenCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_a9b3b5d51da1c75242055338b5" ON "conversations" ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" DROP COLUMN IF EXISTS "search_vector"`,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" DROP COLUMN IF EXISTS "confidence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" ADD COLUMN IF NOT EXISTS "confidence" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" DROP COLUMN IF EXISTS "embedding"`,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" ADD COLUMN IF NOT EXISTS "embedding" text`,
    );
    // Add foreign key constraint if not exists
    const constraintExists = await queryRunner.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'messages' AND constraint_name = 'FK_e5663ce0c730b2de83445e2fd19'
    `);
    if (!constraintExists || constraintExists.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "messages" ADD CONSTRAINT "FK_e5663ce0c730b2de83445e2fd19" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_e5663ce0c730b2de83445e2fd19"`,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" DROP COLUMN "embedding"`,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" ADD "embedding" vector(768)`,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" DROP COLUMN "confidence"`,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" ADD "confidence" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "research_results" ADD "search_vector" tsvector`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a9b3b5d51da1c75242055338b5"`,
    );
    await queryRunner.query(`DROP TABLE "conversations"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e5663ce0c730b2de83445e2fd1"`,
    );
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(
      `CREATE INDEX "idx_research_results_embedding" ON "research_results" ("embedding") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_research_results_search_vector" ON "research_results" ("search_vector") `,
    );
  }
}
