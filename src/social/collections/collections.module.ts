import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { ArtworkSave } from './entities/artwork-save.entity';
import { Artwork } from '../artworks/entities/artwork.entity';
import { ArtworkLike } from '../artworks/entities/artwork-like.entity';
import { UserFollower } from '../follow/entities/user-follower.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArtworkSave, Artwork, ArtworkLike, UserFollower]),
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
