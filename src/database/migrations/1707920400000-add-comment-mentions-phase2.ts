import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddCommentMentionsPhase21707920400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'artwork_comment_mentions',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'comment_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'mentioned_user_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('artwork_comment_mentions', [
      new TableForeignKey({
        columnNames: ['comment_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'artwork_comments',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['mentioned_user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    await queryRunner.createIndices('artwork_comment_mentions', [
      new TableIndex({ columnNames: ['comment_id'] }),
      new TableIndex({ columnNames: ['mentioned_user_id'] }),
      new TableIndex({
        columnNames: ['comment_id', 'mentioned_user_id'],
        isUnique: true,
      }),
    ]);

    await queryRunner.query(
      "ALTER TABLE `user_notifications` MODIFY `type` ENUM('follow','like','comment','mention','system') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `user_notifications` MODIFY `type` ENUM('follow','like','comment','system') NOT NULL",
    );

    const mentionsTable = await queryRunner.getTable(
      'artwork_comment_mentions',
    );
    if (mentionsTable) {
      for (const foreignKey of mentionsTable.foreignKeys) {
        await queryRunner.dropForeignKey(
          'artwork_comment_mentions',
          foreignKey,
        );
      }
    }

    await queryRunner.dropTable('artwork_comment_mentions');
  }
}
