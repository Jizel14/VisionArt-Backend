import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { DropBannersTable1768000000000 } from './migrations/1768000000000-DropBannersTable';

config({ path: join(__dirname, '..', '.env') });

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10) || 3306,
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'visionart',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  charset: 'utf8mb4',
  migrations: [DropBannersTable1768000000000],
  migrationsTableName: 'typeorm_migrations',
});
