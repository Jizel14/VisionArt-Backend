import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import Stripe from 'stripe';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from './entities/subscription.entity';

const FREE_QUOTA = 10;

@Injectable()
export class SubscriptionsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    private readonly config: ConfigService,
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

  async createCheckoutSession(
    userId: string,
    userEmail: string,
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

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
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
      metadata: { userId },
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
