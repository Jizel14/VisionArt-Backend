import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from 'src/users/user.entity';
import { Report } from 'src/reports/report.entity';
import { Artwork } from 'src/social/artwork.entity';
import { Like } from 'src/social/like.entity';
import { Comment } from 'src/social/comment.entity';

export const getDatabaseConfig = (): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10) || 3306,
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'visionart',
  entities: [User, Report, Artwork, Like, Comment],
  // Auto-sync: create/update tables from entities in dev; disable in production.
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.DB_LOGGING === 'true',
  charset: 'utf8mb4',
});
