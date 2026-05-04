import { Controller, Post, UseGuards } from '@nestjs/common';
import { AnnouncementNotifyGuard } from './announcement-notify.guard';
import { AnnouncementsNotifyService } from './announcements-notify.service';

@Controller('announcements')
export class AnnouncementsNotifyController {
  constructor(private readonly notifyService: AnnouncementsNotifyService) {}

  /** Called by backoffice after POST/DELETE on announcements so mobile updates instantly. */
  @Post('notify')
  @UseGuards(AnnouncementNotifyGuard)
  async notify(): Promise<{ ok: boolean }> {
    await this.notifyService.broadcastActiveFromDatabase();
    return { ok: true };
  }
}
