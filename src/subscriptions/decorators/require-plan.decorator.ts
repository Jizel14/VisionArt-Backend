import { SetMetadata } from '@nestjs/common';
import { SubscriptionPlan } from '../entities/subscription.entity';

export const REQUIRE_PLAN_KEY = 'requiredPlan';
export const RequirePlan = (plan: SubscriptionPlan) =>
  SetMetadata(REQUIRE_PLAN_KEY, plan);
