import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import Stripe from 'stripe';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from './entities/subscription.entity';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PromoService } from '../promo/promo.service';

const FREE_QUOTA = 10;

@Injectable()
export class SubscriptionsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    private readonly config: ConfigService,
    private readonly loyalty: LoyaltyService,
    private readonly promo: PromoService,
    private readonly dataSource: DataSource,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'), {
      apiVersion: '2026-03-25.dahlia',
    });
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  async getSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    return this.subscriptionRepo.findOne({ where: { userId } });
  }

  async getOrCreateSubscription(userId: string): Promise<Subscription> {
    let sub = await this.subscriptionRepo.findOne({ where: { userId } });
    if (!sub) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      nextMonth.setHours(0, 0, 0, 0);
      sub = this.subscriptionRepo.create({
        userId,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        generationsUsedThisMonth: 0,
        quotaResetAt: nextMonth,
      });
      await this.subscriptionRepo.save(sub);
    }
    return sub;
  }

  getSubscriptionMeta(sub: Subscription) {
    return {
      plan: sub.plan,
      status: sub.status,
      generationsUsedThisMonth: sub.generationsUsedThisMonth,
      quotaLimit: sub.plan === SubscriptionPlan.PRO ? null : FREE_QUOTA,
      currentPeriodEnd: sub.currentPeriodEnd,
      quotaResetAt: sub.quotaResetAt,
    };
  }

  // ── Checkout ───────────────────────────────────────────────────────────────

  async validatePromoCode(userId: string, promoCode?: string) {
    const basePrice = Number(this.config.get('PRO_MONTHLY_EUR') ?? 9.99);
    const code = (promoCode ?? '').trim().toUpperCase();
    if (!code) {
      return {
        valid: false,
        reason: 'EMPTY',
        code: null,
        discountPct: 0,
        basePrice,
        finalPrice: basePrice,
      };
    }

    const validation = await this.promo.validate(code, userId);
    if (!validation.valid || !validation.promo) {
      return {
        valid: false,
        reason: validation.reason ?? 'INVALID',
        code,
        discountPct: 0,
        basePrice,
        finalPrice: basePrice,
      };
    }

    const discountPct = Number(validation.promo.discountPct ?? 0);
    const finalPrice = Math.max(
      0,
      Math.round((basePrice * (1 - discountPct / 100)) * 100) / 100,
    );

    return {
      valid: discountPct > 0,
      reason: discountPct > 0 ? undefined : 'NO_DISCOUNT',
      code,
      discountPct,
      basePrice,
      finalPrice,
      validUntil: validation.promo.validUntil,
      maxUses: validation.promo.maxUses,
      usedCount: validation.promo.usedCount,
    };
  }

  async createCheckoutSession(
    userId: string,
    userEmail: string,
    promoCode?: string,
  ): Promise<{ sessionId: string; checkoutUrl: string }> {
    const sub = await this.getOrCreateSubscription(userId);

    // Retrieve or create Stripe customer — never create duplicates
    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: userEmail,
        metadata: { userId },
      });
      customerId = customer.id;
      await this.subscriptionRepo.update(sub.id, {
        stripeCustomerId: customerId,
      });
    }

    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    let appliedPromo: { code: string; discountPct: number } | null = null;

    if (promoCode && promoCode.trim()) {
      const code = promoCode.trim().toUpperCase();
      const validation = await this.promo.validate(code, userId);
      if (!validation.valid || !validation.promo) {
        throw new ForbiddenException({
          message: 'Invalid promo code',
          code: validation.reason ?? 'INVALID',
        });
      }
      if ((validation.promo.discountPct ?? 0) <= 0) {
        throw new ForbiddenException({
          message: 'Promo code has no discount',
          code: 'NO_DISCOUNT',
        });
      }

      // For demo: create a Stripe coupon on the fly.
      // (In production we would reuse and persist coupon IDs.)
      const coupon = await this.stripe.coupons.create({
        percent_off: validation.promo.discountPct,
        duration: 'once',
        name: `VisionArt ${code}`,
      });
      discounts = [{ coupon: coupon.id }];
      appliedPromo = { code, discountPct: validation.promo.discountPct };
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      discounts,
      line_items: [
        {
          price: this.config.getOrThrow('STRIPE_PRO_PRICE_ID'),
          quantity: 1,
        },
      ],
      success_url:
        this.config.get('FRONTEND_SUCCESS_URL') ??
        'visionart://subscription/success',
      cancel_url:
        this.config.get('FRONTEND_CANCEL_URL') ??
        'visionart://subscription/cancel',
      metadata: { userId, promoCode: appliedPromo?.code ?? '' },
    });

    return { sessionId: session.id, checkoutUrl: session.url! };
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancelSubscription(userId: string): Promise<{ message: string }> {
    const sub = await this.subscriptionRepo.findOne({ where: { userId } });
    if (!sub?.stripeSubscriptionId) {
      throw new NotFoundException('No active subscription found');
    }

    await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await this.subscriptionRepo.update(sub.id, {
      status: SubscriptionStatus.CANCELED,
    });

    return {
      message:
        'Subscription will be canceled at the end of the billing period',
    };
  }

  // ── Quota enforcement ──────────────────────────────────────────────────────

  async checkAndIncrementGenerationQuota(userId: string): Promise<void> {
    const sub = await this.getOrCreateSubscription(userId);

    if (sub.plan === SubscriptionPlan.PRO) return;

    if (sub.generationsUsedThisMonth >= FREE_QUOTA) {
      throw new ForbiddenException({
        message:
          'Monthly generation quota exceeded. Upgrade to Pro for unlimited generations.',
        quotaLimit: FREE_QUOTA,
        used: sub.generationsUsedThisMonth,
      });
    }

    await this.subscriptionRepo.increment(
      { userId },
      'generationsUsedThisMonth',
      1,
    );
  }

  // ── Webhook helpers ────────────────────────────────────────────────────────

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.getOrThrow('STRIPE_WEBHOOK_SECRET'),
    );
  }

  async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.metadata?.userId;
    if (!userId) return;

    const stripeSubId = session.subscription as string;
    // currentPeriodEnd will be set precisely by the invoice.paid event
    // which fires immediately after checkout.session.completed
    await this.subscriptionRepo.update(
      { userId },
      {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: stripeSubId,
        generationsUsedThisMonth: 0,
      },
    );
    this.logger.log(`User ${userId} upgraded to Pro`);

    // Attribution: if a promo code was used, mark it used and emit a CONVERTED event
    const promoCode = (session.metadata?.promoCode || '').trim();
    if (promoCode) {
      try {
        await this.promo.markUsed(promoCode);
      } catch (e) {
        this.logger.warn(`Promo markUsed failed: ${(e as Error).message}`);
      }
      try {
        const [row] = await this.dataSource.query(
          `SELECT id FROM retention_actions WHERE promo_code = ? ORDER BY created_at DESC LIMIT 1`,
          [promoCode],
        );
        if (row?.id) {
          const proMonthlyEur = Number(this.config.get('PRO_MONTHLY_EUR') ?? 9.99);
          // best-effort: infer discount % from promo_codes table
          const [promo] = await this.dataSource.query(
            `SELECT discount_pct FROM promo_codes WHERE code = ? LIMIT 1`,
            [promoCode],
          );
          const discountPct = Number(promo?.discount_pct ?? 0);
          const savedEur = Math.round((proMonthlyEur * discountPct / 100) * 100) / 100;
          await this.dataSource.query(
            `INSERT INTO retention_events (action_id, type, metadata, created_at)
             VALUES (?, 'CONVERTED', JSON_OBJECT('promoCode', ?, 'discountPct', ?, 'savedEur', ?), NOW())`,
            [row.id, promoCode, discountPct, savedEur],
          );
        }
      } catch (e) {
        this.logger.warn(`Retention conversion event insert failed: ${(e as Error).message}`);
      }
    }
  }

  async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    // In Stripe v21, subscription ID lives in parent.subscription_details
    const subDetails = invoice.parent?.subscription_details as
      | { subscription?: string | Stripe.Subscription }
      | undefined;
    const stripeSubId =
      typeof subDetails?.subscription === 'string'
        ? subDetails.subscription
        : (subDetails?.subscription as Stripe.Subscription | undefined)?.id;

    if (!stripeSubId) return;

    const periodEnd = new Date(invoice.period_end * 1000);

    await this.subscriptionRepo.update(
      { stripeSubscriptionId: stripeSubId },
      {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: periodEnd,
        generationsUsedThisMonth: 0,
      },
    );

    // Award loyalty points for the renewal — idempotent on (user, periodEnd)
    const sub = await this.subscriptionRepo.findOne({
      where: { stripeSubscriptionId: stripeSubId },
    });
    if (sub) {
      try {
        await this.loyalty.awardRenewal(sub.userId, periodEnd.toISOString());
      } catch (e) {
        this.logger.warn(
          `Loyalty award (renewal) failed for ${sub.userId}: ${(e as Error).message}`,
        );
      }
    }
    this.logger.log(`Invoice paid – reset quota for subscription ${stripeSubId}`);
  }

  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subDetails = invoice.parent?.subscription_details as
      | { subscription?: string | Stripe.Subscription }
      | undefined;
    const stripeSubId =
      typeof subDetails?.subscription === 'string'
        ? subDetails.subscription
        : (subDetails?.subscription as Stripe.Subscription | undefined)?.id;

    if (!stripeSubId) return;

    await this.subscriptionRepo.update(
      { stripeSubscriptionId: stripeSubId },
      { status: SubscriptionStatus.PAST_DUE },
    );
    this.logger.warn(`Payment failed for subscription ${stripeSubId}`);
  }

  async handleSubscriptionDeleted(
    stripeSub: Stripe.Subscription,
  ): Promise<void> {
    await this.subscriptionRepo.update(
      { stripeSubscriptionId: stripeSub.id },
      {
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.INACTIVE,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      },
    );
    this.logger.log(
      `Subscription ${stripeSub.id} deleted – user reverted to Free`,
    );
  }

  // ── Cron: reset monthly quota every 1st of the month at midnight ──────────

  @Cron('0 0 1 * *')
  async resetMonthlyQuotas(): Promise<void> {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    nextMonth.setHours(0, 0, 0, 0);

    await this.subscriptionRepo
      .createQueryBuilder()
      .update()
      .set({ generationsUsedThisMonth: 0, quotaResetAt: nextMonth })
      .execute();

    this.logger.log('Monthly generation quotas reset');
  }
}
