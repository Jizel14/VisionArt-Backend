import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateUserPreferences1707909600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_preferences table
    await queryRunner.createTable(
      new Table({
        name: 'user_preferences',
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
          // Artistic Style Preferences
          {
            name: 'favorite_styles',
            type: 'json',
            isNullable: false,
            default: "'[]'",
          },
          {
            name: 'favorite_colors',
            type: 'json',
            isNullable: false,
            default: "'[]'",
          },
          {
            name: 'preferred_mood',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'art_complexity',
            type: 'enum',
            enum: ['minimal', 'moderate', 'detailed'],
            default: "'moderate'",
            isNullable: false,
          },
          // Context Preferences (GDPR-sensitive)
          {
            name: 'enable_location_context',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'enable_weather_context',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'enable_calendar_context',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'enable_music_context',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'enable_time_context',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'location_precision',
            type: 'enum',
            enum: ['city', 'district', 'precise'],
            default: "'city'",
            isNullable: false,
          },
          // Generation Preferences
          {
            name: 'default_resolution',
            type: 'varchar',
            length: '50',
            default: "'1024x1024'",
            isNullable: false,
          },
          {
            name: 'default_aspect_ratio',
            type: 'varchar',
            length: '50',
            default: "'square'",
            isNullable: false,
          },
          {
            name: 'enable_nsfw_filter',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'generation_quality',
            type: 'enum',
            enum: ['fast', 'balanced', 'quality'],
            default: "'balanced'",
            isNullable: false,
          },
          // UI/UX Preferences
          {
            name: 'preferred_language',
            type: 'enum',
            enum: ['fr', 'en', 'ar'],
            default: "'fr'",
            isNullable: false,
          },
          {
            name: 'theme',
            type: 'enum',
            enum: ['light', 'dark', 'auto'],
            default: "'auto'",
            isNullable: false,
          },
          {
            name: 'notifications_enabled',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'email_notifications_enabled',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          // Privacy & Data Retention
          {
            name: 'data_retention_period',
            type: 'int',
            isNullable: true,
            default: 365,
          },
          {
            name: 'allow_data_for_training',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'share_generations_publicly',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          // Timestamps
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'last_style_update',
            type: 'timestamp',
            isNullable: true,
          },
          // ML Integration
          {
            name: 'learned_style_vector',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'style_feedback_history',
            type: 'json',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Set charset for UTF-8 support
    await queryRunner.query(
      'ALTER TABLE `user_preferences` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );

    // Create foreign key (with CASCADE DELETE for GDPR compliance)
    await queryRunner.createForeignKey(
      'user_preferences',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );

    // Create index on user_id for fast lookups
    await queryRunner.createIndex(
      'user_preferences',
      new TableIndex({
        columnNames: ['user_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user_preferences');

    if (table) {
      const foreignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('user_id') !== -1,
      );

      if (foreignKey) {
        await queryRunner.dropForeignKey('user_preferences', foreignKey);
      }
    }

    await queryRunner.dropTable('user_preferences');
  }
}
