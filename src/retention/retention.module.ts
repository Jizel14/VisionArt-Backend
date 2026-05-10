import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { RetentionRun } from './entities/retention-run.entity';
import { RetentionAction } from './entities/retention-action.entity';
import { RetentionEvent } from './entities/retention-event.entity';
import { User } from '../users/user.entity';
import { RetentionService } from './retention.service';
import { RetentionSegmentationService } from './retention-segmentation.service';
import { RetentionMessageService } from './retention-message.service';
import { RetentionMailerService } from './retention-mailer.service';
import { RetentionController } from './retention.controller';
import { PromoModule } from '../promo/promo.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { NotificationsModule } from '../social/notifications/notifications.module';
import { AdminGuard } from '../ai-moderation/guards/admin.guard';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      RetentionRun,
      RetentionAction,
      RetentionEvent,
      User,
    ]),
    PromoModule,
    LoyaltyModule,
    NotificationsModule,
  ],
  controllers: [RetentionController],
  providers: [
    RetentionService,
    RetentionSegmentationService,
    RetentionMessageService,
    RetentionMailerService,
    AdminGuard,
  ],
  exports: [RetentionService],
})
export class RetentionModule {}
