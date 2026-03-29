import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PLAN_KEY } from '../decorators/require-plan.decorator';
import { SubscriptionPlan } from '../entities/subscription.entity';
import { SubscriptionsService } from '../subscriptions.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlan = this.reflector.getAllAndOverride<SubscriptionPlan>(
      REQUIRE_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPlan) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.userId;
    if (!userId) throw new ForbiddenException('Not authenticated');

    const subscription =
      await this.subscriptionsService.getSubscriptionByUserId(userId);

    if (!subscription || subscription.plan !== requiredPlan) {
      throw new ForbiddenException({
        message: 'This feature requires a Pro subscription',
        requiredPlan,
        currentPlan: subscription?.plan ?? SubscriptionPlan.FREE,
      });
    }

    return true;
  }
}
