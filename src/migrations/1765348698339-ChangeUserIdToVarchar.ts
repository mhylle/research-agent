import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeUserIdToVarchar1765348698339 implements MigrationInterface {
  name = 'ChangeUserIdToVarchar1765348698339';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversations" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversations" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
  }
}
