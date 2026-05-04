import { Module } from '@nestjs/common';
import { ArtworksController } from './artworks.controller';
import { NotificationsController } from './notifications.controller';
import { FollowController } from './follow.controller';

import { ReportsModule } from '../reports/reports.module';
import { ImageGenerationService } from './image-generation.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artwork } from './artwork.entity';
import { Like } from './like.entity';
import { Comment } from './comment.entity';
import { ArtworksService } from './artworks.service';

@Module({
  imports: [
    ReportsModule,
    TypeOrmModule.forFeature([Artwork, Like, Comment])
  ],
  controllers: [ArtworksController, NotificationsController, FollowController],
  providers: [ImageGenerationService, ArtworksService],
})
export class SocialModule { }
