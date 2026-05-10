import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { UserNotification } from './entities/user-notification.entity';
import { User } from '../../users/user.entity';
import { AdminGuard } from '../../ai-moderation/guards/admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserNotification, User])],
  controllers: [NotificationsController],
  providers: [NotificationsService, AdminGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
