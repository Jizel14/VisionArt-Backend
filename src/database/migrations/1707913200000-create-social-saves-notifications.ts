import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateSocialSavesNotifications1707913200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'artwork_saves',
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
            name: 'user_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'artwork_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'collection_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
            default: "'Favorites'",
          },
          {
            name: 'saved_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('artwork_saves', [
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['artwork_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'artworks',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    ]);

    await queryRunner.createIndices('artwork_saves', [
      new TableIndex({ columnNames: ['user_id'] }),
      new TableIndex({ columnNames: ['artwork_id'] }),
      new TableIndex({ columnNames: ['user_id', 'collection_name'] }),
      new TableIndex({
        columnNames: ['user_id', 'artwork_id'],
        isUnique: true,
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'user_notifications',
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
            name: 'user_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['follow', 'like', 'comment', 'system'],
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '160',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'actor_user_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'artwork_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'is_read',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'read_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('user_notifications', [
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['actor_user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['artwork_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'artworks',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    ]);

    await queryRunner.createIndices('user_notifications', [
      new TableIndex({ columnNames: ['user_id'] }),
      new TableIndex({ columnNames: ['user_id', 'is_read'] }),
      new TableIndex({ columnNames: ['created_at'] }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const notificationTable = await queryRunner.getTable('user_notifications');
    if (notificationTable) {
      for (const foreignKey of notificationTable.foreignKeys) {
        await queryRunner.dropForeignKey('user_notifications', foreignKey);
      }
    }
    await queryRunner.dropTable('user_notifications');

    const savesTable = await queryRunner.getTable('artwork_saves');
    if (savesTable) {
      for (const foreignKey of savesTable.foreignKeys) {
        await queryRunner.dropForeignKey('artwork_saves', foreignKey);
      }
    }
    await queryRunner.dropTable('artwork_saves');
  }
}
