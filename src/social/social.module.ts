import { Module } from '@nestjs/common';
import { FollowModule } from './follow/follow.module';
import { ArtworksModule } from './artworks/artworks.module';
import { ModerationModule } from './moderation/moderation.module';
import { CollectionsModule } from './collections/collections.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    FollowModule,
    ArtworksModule,
    ModerationModule,
    CollectionsModule,
    NotificationsModule,
  ],
  exports: [
    FollowModule,
    ArtworksModule,
    ModerationModule,
    CollectionsModule,
    NotificationsModule,
  ],
})
export class SocialModule {}
