import { Module } from '@nestjs/common';
import { FollowModule } from './follow/follow.module';
import { ArtworksModule } from './artworks/artworks.module';
import { ModerationModule } from './moderation/moderation.module';

@Module({
  imports: [FollowModule, ArtworksModule, ModerationModule],
  exports: [FollowModule, ArtworksModule, ModerationModule],
})
export class SocialModule {}
