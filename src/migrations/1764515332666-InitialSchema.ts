import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1764515332666 implements MigrationInterface {
  name = 'InitialSchema1764515332666';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "log_entries" ("id" uuid NOT NULL, "logId" uuid NOT NULL, "timestamp" TIMESTAMP NOT NULL, "eventType" character varying(50) NOT NULL, "planId" uuid, "phaseId" uuid, "stepId" uuid, "data" text NOT NULL, CONSTRAINT "PK_b226cc4051321f12106771581e0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af3cdef36fa31bf844dd447f55" ON "log_entries" ("logId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_88410904513ed6cfdd598a777b" ON "log_entries" ("timestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4152c65515b03eaf13885b38fa" ON "log_entries" ("eventType") `,
    );
    await queryRunner.query(
      `CREATE TABLE "research_results" ("id" uuid NOT NULL, "logId" uuid NOT NULL, "planId" uuid NOT NULL, "query" text NOT NULL, "answer" text NOT NULL, "sources" text NOT NULL, "metadata" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f46909497654cd4d57170af8c79" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7dd34d3471affc9b9837fffe15" ON "research_results" ("logId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "evaluation_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "logId" character varying NOT NULL, "queryId" character varying, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), "userQuery" character varying NOT NULL, "planEvaluation" text NOT NULL, "retrievalEvaluation" text, "answerEvaluation" text, "overallScore" double precision NOT NULL, "evaluationSkipped" boolean NOT NULL DEFAULT false, "skipReason" character varying, CONSTRAINT "PK_a7909adbe4600b23ead60806659" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3c43de34f34eba2588e988eb42" ON "evaluation_records" ("logId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3c43de34f34eba2588e988eb42"`,
    );
    await queryRunner.query(`DROP TABLE "evaluation_records"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7dd34d3471affc9b9837fffe15"`,
    );
    await queryRunner.query(`DROP TABLE "research_results"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4152c65515b03eaf13885b38fa"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_88410904513ed6cfdd598a777b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_af3cdef36fa31bf844dd447f55"`,
    );
    await queryRunner.query(`DROP TABLE "log_entries"`);
  }
}
