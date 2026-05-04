import { Injectable } from '@nestjs/common';
import { AnnouncementsGateway } from './announcements.gateway';

@Injectable()
export class AnnouncementsNotifyService {
  constructor(private readonly gateway: AnnouncementsGateway) {}

  async broadcastActiveFromDatabase(): Promise<void> {
    await this.gateway.emitActiveFromDatabase();
  }
}
