import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { WebhooksController } from './webhooks.controller';
import { SubscriptionGuard } from './guards/subscription.guard';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PromoModule } from '../promo/promo.module';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription]), LoyaltyModule, PromoModule],
  controllers: [SubscriptionsController, WebhooksController],
  providers: [SubscriptionsService, SubscriptionGuard],
  exports: [SubscriptionsService, SubscriptionGuard],
})
export class SubscriptionsModule {}
