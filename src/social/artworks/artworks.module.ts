import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artwork } from './entities/artwork.entity';
import { ArtworkLike } from './entities/artwork-like.entity';
import { ArtworkComment } from './entities/artwork-comment.entity';
import { User } from '../../users/user.entity';
import { ArtworksController } from './artworks.controller';
import { EngagementController } from './engagement.controller';
import { ArtworkService } from './artwork.service';
import { LikeService } from './like.service';
import { CommentService } from './comment.service';
import { FollowModule } from '../follow/follow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Artwork, ArtworkLike, ArtworkComment, User]),
    FollowModule,
  ],
  providers: [ArtworkService, LikeService, CommentService],
  controllers: [ArtworksController, EngagementController],
  exports: [ArtworkService, LikeService, CommentService],
})
export class ArtworksModule {}
