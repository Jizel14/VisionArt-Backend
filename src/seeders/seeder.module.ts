import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { UserPreferences } from '../user-preferences/entities/user-preferences.entity';
import { Artwork } from '../social/artworks/entities/artwork.entity';
import { UserFollower } from '../social/follow/entities/user-follower.entity';
import { ArtworkLike } from '../social/artworks/entities/artwork-like.entity';
import { ArtworkComment } from '../social/artworks/entities/artwork-comment.entity';
import { PlaygroundSeeder } from './playground.seeder';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserPreferences,
      Artwork,
      UserFollower,
      ArtworkLike,
      ArtworkComment,
    ]),
  ],
  providers: [PlaygroundSeeder],
  exports: [PlaygroundSeeder],
})
export class SeederModule {}
