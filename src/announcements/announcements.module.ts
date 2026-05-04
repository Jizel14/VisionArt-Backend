import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnnouncementNotifyGuard } from './announcement-notify.guard';
import { AnnouncementsGateway } from './announcements.gateway';
import { AnnouncementsNotifyController } from './announcements-notify.controller';
import { AnnouncementsNotifyService } from './announcements-notify.service';

@Module({
  imports: [ConfigModule],
  controllers: [AnnouncementsNotifyController],
  providers: [
    AnnouncementsGateway,
    AnnouncementsNotifyService,
    AnnouncementNotifyGuard,
  ],
})
export class AnnouncementsModule {}
