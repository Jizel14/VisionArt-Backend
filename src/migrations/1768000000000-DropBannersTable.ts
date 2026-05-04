import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropBannersTable1768000000000 implements MigrationInterface {
  name = 'DropBannersTable1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS banners`);
  }

  public async down(): Promise<void> {
    // Feature removed; no automatic recreate.
  }
}
