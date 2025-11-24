import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLogEntriesTable1764018277562 implements MigrationInterface {
  name = 'AddLogEntriesTable1764018277562';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "log_entries" (
        "id" uuid NOT NULL,
        "logId" uuid NOT NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "eventType" varchar(50) NOT NULL,
        "planId" uuid,
        "phaseId" uuid,
        "stepId" uuid,
        "data" jsonb NOT NULL,
        CONSTRAINT "PK_log_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_log_entries_logId" ON "log_entries" ("logId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_log_entries_timestamp" ON "log_entries" ("timestamp")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_log_entries_eventType" ON "log_entries" ("eventType")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_log_entries_data" ON "log_entries" USING GIN ("data")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_log_entries_data"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_log_entries_eventType"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_log_entries_timestamp"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_log_entries_logId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "log_entries"`);
  }
}
