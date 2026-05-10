import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LoyaltyPoints } from './entities/loyalty-points.entity';
import { LoyaltyEvent, LoyaltyEventType } from './entities/loyalty-event.entity';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../subscriptions/entities/subscription.entity';

/**
 * Loyalty programme — a thin, deterministic layer above users.
 * Points are awarded by source events and can be redeemed for free PRO months.
 *
 * Conversion rates:
 *   500 points = 1 free PRO month
 *   1000 points = 3 free PRO months
 */
export const LOYALTY_RULES = {
  LOGIN_DAILY: 1,
  ARTWORK_CREATED: 5,
  LIKE_RECEIVED: 2,
  COMMENT_RECEIVED: 2,
  REFERRAL: 50,
  RENEWAL: 100,
} as const;

export const REDEMPTION_TIERS = [
  { points: 500, freeMonths: 1, label: '1 mois PRO offert' },
  { points: 1000, freeMonths: 3, label: '3 mois PRO offerts' },
] as const;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    @InjectRepository(LoyaltyPoints)
    private readonly pointsRepo: Repository<LoyaltyPoints>,
    @InjectRepository(LoyaltyEvent)
    private readonly eventsRepo: Repository<LoyaltyEvent>,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    private readonly dataSource: DataSource,
  ) {}

  async getBalance(userId: string): Promise<number> {
    const row = await this.pointsRepo.findOne({ where: { userId } });
    return row?.balance ?? 0;
  }

  async getOrInit(userId: string): Promise<LoyaltyPoints> {
    let row = await this.pointsRepo.findOne({ where: { userId } });
    if (!row) {
      row = this.pointsRepo.create({ userId, balance: 0, lifetimeEarned: 0 });
      await this.pointsRepo.save(row);
    }
    return row;
  }

  /**
   * Award points and record an event. Idempotent for daily-bucket events
   * via the optional `dedupeKey` (refId).
   */
  async award(
    userId: string,
    type: LoyaltyEventType,
    delta: number,
    refId: string | null = null,
    metadata: Record<string, unknown> | null = null,
  ): Promise<LoyaltyPoints> {
    if (delta === 0) return this.getOrInit(userId);

    if (refId) {
      const existing = await this.eventsRepo.findOne({
        where: { userId, type, refId },
      });
      if (existing) {
        this.logger.debug(
          `Loyalty event already recorded (idempotent) user=${userId} type=${type} ref=${refId}`,
        );
        return this.getOrInit(userId);
      }
    }

    return this.dataSource.transaction(async (mgr) => {
      const points = await mgr
        .getRepository(LoyaltyPoints)
        .findOne({ where: { userId } });

      if (!points) {
        const fresh = mgr.getRepository(LoyaltyPoints).create({
          userId,
          balance: Math.max(0, delta),
          lifetimeEarned: Math.max(0, delta),
        });
        await mgr.getRepository(LoyaltyPoints).save(fresh);
      } else {
        points.balance = Math.max(0, points.balance + delta);
        if (delta > 0) points.lifetimeEarned += delta;
        await mgr.getRepository(LoyaltyPoints).save(points);
      }

      const event = mgr.getRepository(LoyaltyEvent).create({
        userId,
        type,
        delta,
        refId,
        metadata,
      });
      await mgr.getRepository(LoyaltyEvent).save(event);

      const updated = await mgr
        .getRepository(LoyaltyPoints)
        .findOne({ where: { userId } });
      return updated!;
    });
  }

  /**
   * Award points for a user's daily login.
   * The dedupe key is the YYYY-MM-DD (UTC) day so the user can earn
   * at most 1 LOGIN_DAILY event per calendar day.
   */
  async awardDailyLogin(userId: string): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    await this.award(
      userId,
      LoyaltyEventType.LOGIN_DAILY,
      LOYALTY_RULES.LOGIN_DAILY,
      `login:${day}`,
    );
  }

  async awardArtworkCreated(userId: string, artworkId: string): Promise<void> {
    await this.award(
      userId,
      LoyaltyEventType.ARTWORK_CREATED,
      LOYALTY_RULES.ARTWORK_CREATED,
      `artwork:${artworkId}`,
    );
  }

  async awardLikeReceived(userId: string, refId: string): Promise<void> {
    await this.award(
      userId,
      LoyaltyEventType.LIKE_RECEIVED,
      LOYALTY_RULES.LIKE_RECEIVED,
      `like:${refId}`,
    );
  }

  async awardCommentReceived(userId: string, refId: string): Promise<void> {
    await this.award(
      userId,
      LoyaltyEventType.COMMENT_RECEIVED,
      LOYALTY_RULES.COMMENT_RECEIVED,
      `comment:${refId}`,
    );
  }

  async awardReferral(userId: string, referredUserId: string): Promise<void> {
    await this.award(
      userId,
      LoyaltyEventType.REFERRAL,
      LOYALTY_RULES.REFERRAL,
      `referral:${referredUserId}`,
    );
  }

  async awardRenewal(userId: string, periodEndIso: string): Promise<void> {
    await this.award(
      userId,
      LoyaltyEventType.RENEWAL,
      LOYALTY_RULES.RENEWAL,
      `renewal:${periodEndIso}`,
    );
  }

  async listEvents(
    userId: string,
    limit = 50,
  ): Promise<LoyaltyEvent[]> {
    return this.eventsRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(200, limit),
    });
  }

  /**
   * Spend points to redeem a free PRO month tier.
   * Returns the number of free months granted (caller is responsible for
   * extending the subscription period).
   */
  async redeem(userId: string, points: number): Promise<{ freeMonths: number }> {
    const tier = REDEMPTION_TIERS.find((t) => t.points === points);
    if (!tier) {
      throw new Error(
        `Invalid redemption amount: ${points}. Allowed: ${REDEMPTION_TIERS.map((t) => t.points).join(', ')}`,
      );
    }

    const balance = await this.getBalance(userId);
    if (balance < tier.points) {
      throw new Error(
        `Insufficient points: ${balance} < ${tier.points} required`,
      );
    }

    await this.award(
      userId,
      LoyaltyEventType.REDEMPTION,
      -tier.points,
      `redeem:${Date.now()}`,
      { freeMonths: tier.freeMonths, tierLabel: tier.label },
    );

    // Apply the free months to the subscription itself.
    await this.applyFreeProMonths(userId, tier.freeMonths);

    return { freeMonths: tier.freeMonths };
  }

  private async applyFreeProMonths(userId: string, months: number): Promise<void> {
    if (months <= 0) return;

    await this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(Subscription);
      let sub = await repo.findOne({ where: { userId } });
      if (!sub) {
        sub = repo.create({
          userId,
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
          generationsUsedThisMonth: 0,
          quotaResetAt: null,
          currentPeriodEnd: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        });
        sub = await repo.save(sub);
      }

      const now = new Date();
      const base =
        sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;

      const extended = new Date(base);
      extended.setMonth(extended.getMonth() + months);

      await repo.update(
        { userId },
        {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: extended,
          generationsUsedThisMonth: 0,
        },
      );
    });
  }
}
