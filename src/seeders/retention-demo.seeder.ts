import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../subscriptions/entities/subscription.entity';
import { Artwork } from '../social/artworks/entities/artwork.entity';
import { LoyaltyPoints } from '../loyalty/entities/loyalty-points.entity';

type DemoUserSpec = {
  email: string;
  name: string;
  password: string;
  createdDaysAgo: number;
  // login history
  lastLoginDaysAgo: number | null;
  previousLoginGapDays?: number | null; // if set, previous_login_at = last_login_at - gap
  // subscription
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEndDaysFromNow?: number | null; // for PRO, or for lapsed users
  subscriptionCreatedDaysAgo?: number;
  generationsUsedThisMonth?: number;
  // retention meta
  loyaltyBalance?: number;
  topStyle?: string;
  lastArtworkTitle?: string;
};

/**
 * Retention demo seeder.
 * - DOES NOT wipe your DB.
 * - Idempotent: can be re-run; it updates the same demo accounts by email.
 * - Seeds users/subscriptions/artworks/loyalty_points so you can demo:
 *   NEW_TRIAL, ENGAGED_FREE, IDLE_FREE, WIN_BACK_30/60/LOST, RETURNING,
 *   LOYAL_PRO, CHURN_RISK_PRO, PAYMENT_FAILED, LAPSED_PRO_3D/7D/30D.
 */
@Injectable()
export class RetentionDemoSeeder {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Artwork)
    private readonly artworkRepo: Repository<Artwork>,
    @InjectRepository(LoyaltyPoints)
    private readonly loyaltyRepo: Repository<LoyaltyPoints>,
  ) {}

  async seed(): Promise<void> {
    console.log('🌱 Starting retention demo seeder (idempotent)...');

    const password = 'DemoPassword123!';

    const users: DemoUserSpec[] = [
      // --- Real inboxes (you asked to receive real emails) ---
      {
        email: 'ziadijizel26@gmail.com',
        name: 'Jizel Gmail',
        password,
        createdDaysAgo: 120,
        lastLoginDaysAgo: 2,
        previousLoginGapDays: 45, // RETURNING candidate
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        generationsUsedThisMonth: 8, // ENGAGED_FREE possible too; RETURNING takes precedence
        topStyle: 'impressionist',
        lastArtworkTitle: 'Golden Wheat Fields',
        loyaltyBalance: 120,
      },
      {
        email: 'jizel.ziadi@proton.me',
        name: 'Jizel Proton',
        password,
        createdDaysAgo: 240,
        lastLoginDaysAgo: 35,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        generationsUsedThisMonth: 1,
        topStyle: 'digital art',
        lastArtworkTitle: 'Neon Dreams',
        loyaltyBalance: 20,
      },
      {
        email: 'jizel.ziadi@esprit.tn',
        name: 'Jizel Esprit',
        password,
        createdDaysAgo: 365,
        lastLoginDaysAgo: 20,
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEndDaysFromNow: 5, // CHURN_RISK_PRO candidate
        subscriptionCreatedDaysAgo: 120,
        generationsUsedThisMonth: 0,
        topStyle: 'fractal art',
        lastArtworkTitle: 'Crystalline Dreams',
        loyaltyBalance: 620,
      },

      // --- Other demo accounts (for full segment coverage) ---
      {
        email: 'demo.newtrial@visionart.local',
        name: 'Demo New Trial',
        password,
        createdDaysAgo: 2,
        lastLoginDaysAgo: 1,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        generationsUsedThisMonth: 1,
        topStyle: 'abstract art',
        lastArtworkTitle: 'Abstract Consciousness',
        loyaltyBalance: 2,
      },
      {
        email: 'demo.powerfree@visionart.local',
        name: 'Demo Power Free',
        password,
        createdDaysAgo: 60,
        lastLoginDaysAgo: 1,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        generationsUsedThisMonth: 10,
        topStyle: 'digital art',
        lastArtworkTitle: 'Urban Jungle',
        loyaltyBalance: 80,
      },
      {
        email: 'demo.idlefree@visionart.local',
        name: 'Demo Idle Free',
        password,
        createdDaysAgo: 100,
        lastLoginDaysAgo: 18,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        generationsUsedThisMonth: 0,
        topStyle: 'landscape photography',
        lastArtworkTitle: 'Serene Mountain Lake',
        loyaltyBalance: 30,
      },
      {
        email: 'demo.winback30@visionart.local',
        name: 'Demo Winback 30',
        password,
        createdDaysAgo: 200,
        lastLoginDaysAgo: 40,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        generationsUsedThisMonth: 0,
        topStyle: 'impressionist',
        lastArtworkTitle: 'Golden Wheat Fields',
      },
      {
        email: 'demo.winback60@visionart.local',
        name: 'Demo Winback 60',
        password,
        createdDaysAgo: 400,
        lastLoginDaysAgo: 70,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        topStyle: 'fantasy illustration',
        lastArtworkTitle: 'Deep Ocean',
      },
      {
        email: 'demo.lost@visionart.local',
        name: 'Demo Lost',
        password,
        createdDaysAgo: 600,
        lastLoginDaysAgo: 120,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        topStyle: 'digital art',
        lastArtworkTitle: 'Neon Dreams',
      },
      {
        email: 'demo.paymentfailed@visionart.local',
        name: 'Demo Payment Failed',
        password,
        createdDaysAgo: 300,
        lastLoginDaysAgo: 3,
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodEndDaysFromNow: 10,
        subscriptionCreatedDaysAgo: 90,
        topStyle: 'abstract art',
        lastArtworkTitle: 'Abstract Consciousness',
      },
      // Lapsed PRO: plan free + status canceled/inactive + current_period_end in the past
      {
        email: 'demo.lapsed3d@visionart.local',
        name: 'Demo Lapsed 3D',
        password,
        createdDaysAgo: 300,
        lastLoginDaysAgo: 6,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.CANCELED,
        currentPeriodEndDaysFromNow: -2,
        subscriptionCreatedDaysAgo: 150,
        topStyle: 'retro-future',
        lastArtworkTitle: 'Retro Future',
      },
      {
        email: 'demo.lapsed7d@visionart.local',
        name: 'Demo Lapsed 7D',
        password,
        createdDaysAgo: 500,
        lastLoginDaysAgo: 10,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.INACTIVE,
        currentPeriodEndDaysFromNow: -10,
        subscriptionCreatedDaysAgo: 200,
        topStyle: 'digital art',
        lastArtworkTitle: 'Urban Jungle',
      },
      {
        email: 'demo.lapsed30d@visionart.local',
        name: 'Demo Lapsed 30D',
        password,
        createdDaysAgo: 500,
        lastLoginDaysAgo: 25,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.CANCELED,
        currentPeriodEndDaysFromNow: -35,
        subscriptionCreatedDaysAgo: 220,
        topStyle: 'fractal art',
        lastArtworkTitle: 'Crystalline Dreams',
      },
      {
        email: 'demo.loyalpro@visionart.local',
        name: 'Demo Loyal Pro',
        password,
        createdDaysAgo: 800,
        lastLoginDaysAgo: 2,
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEndDaysFromNow: 20,
        subscriptionCreatedDaysAgo: 200,
        topStyle: 'impressionist',
        lastArtworkTitle: 'Golden Wheat Fields',
        loyaltyBalance: 980,
      },
    ];

    for (const spec of users) {
      const u = await this.upsertUser(spec);
      await this.upsertSubscription(u.id, spec);
      await this.upsertLoyalty(u.id, spec.loyaltyBalance ?? 0);
      await this.ensureArtworks(u.id, spec);
      await this.forceTimestamps(u.id, spec);
    }

    console.log('✅ Retention demo seeded successfully.');
    console.log(`🔐 Demo password for all seeded accounts: ${password}`);
  }

  private async upsertUser(spec: DemoUserSpec): Promise<User> {
    const email = spec.email.toLowerCase().trim();
    let user = await this.userRepo.findOne({ where: { email } });

    const passwordHash = await bcrypt.hash(spec.password, 10);
    if (!user) {
      user = this.userRepo.create({
        email,
        name: spec.name,
        passwordHash,
        bio: 'Retention demo account',
        avatarUrl: null,
        phoneNumber: null,
        website: null,
        isVerified: true,
        isPrivateAccount: false,
        isAdmin: false,
        followersCount: 0,
        followingCount: 0,
        publicGenerationsCount: 0,
        locale: 'fr',
        marketingOptIn: true,
        lastLoginAt: null,
        lastActiveAt: null,
        previousLoginAt: null,
      });
      user = await this.userRepo.save(user);
    } else {
      await this.userRepo.update(
        { id: user.id },
        {
          name: spec.name,
          passwordHash,
          locale: 'fr',
          marketingOptIn: true,
        },
      );
      user = (await this.userRepo.findOne({ where: { id: user.id } }))!;
    }
    return user;
  }

  private async upsertSubscription(userId: string, spec: DemoUserSpec) {
    let sub = await this.subRepo.findOne({ where: { userId } });
    if (!sub) {
      sub = this.subRepo.create({
        userId,
        plan: spec.plan,
        status: spec.status,
        generationsUsedThisMonth: spec.generationsUsedThisMonth ?? 0,
        quotaResetAt: null,
        currentPeriodEnd: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });
      sub = await this.subRepo.save(sub);
    }

    const currentPeriodEnd =
      spec.currentPeriodEndDaysFromNow == null
        ? null
        : daysFromNow(spec.currentPeriodEndDaysFromNow);

    await this.subRepo.update(
      { userId },
      {
        plan: spec.plan,
        status: spec.status,
        generationsUsedThisMonth: spec.generationsUsedThisMonth ?? 0,
        currentPeriodEnd,
      },
    );

    // Make months_active meaningful in segmentation (it uses subscriptions.created_at)
    if (spec.subscriptionCreatedDaysAgo && spec.subscriptionCreatedDaysAgo > 0) {
      await this.subRepo.query(
        'UPDATE subscriptions SET created_at = DATE_SUB(NOW(), INTERVAL ? DAY) WHERE user_id = ?',
        [spec.subscriptionCreatedDaysAgo, userId],
      );
    }
  }

  private async upsertLoyalty(userId: string, balance: number) {
    let row = await this.loyaltyRepo.findOne({ where: { userId } });
    if (!row) {
      row = this.loyaltyRepo.create({
        userId,
        balance: Math.max(0, balance),
        lifetimeEarned: Math.max(0, balance),
      });
      await this.loyaltyRepo.save(row);
    } else {
      await this.loyaltyRepo.update(
        { userId },
        {
          balance: Math.max(0, balance),
        },
      );
    }
  }

  private async ensureArtworks(userId: string, spec: DemoUserSpec) {
    const existing = await this.artworkRepo.count({ where: { userId } });
    if (existing >= 2) return;

    const style = spec.topStyle || 'digital art';
    const title = spec.lastArtworkTitle || `Demo Artwork (${style})`;

    const art1 = this.artworkRepo.create({
      userId,
      title: `${title} #1`,
      description: 'Retention demo artwork',
      imageUrl: `https://picsum.photos/seed/retention-${encodeURIComponent(userId)}-1/800/800`,
      thumbnailUrl: `https://picsum.photos/seed/retention-${encodeURIComponent(userId)}-1/256/256`,
      prompt: {
        text: `demo prompt for ${style}`,
        style,
        mood: 'calm',
      },
      isPublic: true,
      isNSFW: false,
      metadata: { seed: 'retention-demo' },
      likesCount: 5,
      commentsCount: 1,
      remixCount: 0,
    });

    const art2 = this.artworkRepo.create({
      userId,
      title: `${title} #2`,
      description: 'Retention demo artwork',
      imageUrl: `https://picsum.photos/seed/retention-${encodeURIComponent(userId)}-2/800/800`,
      thumbnailUrl: `https://picsum.photos/seed/retention-${encodeURIComponent(userId)}-2/256/256`,
      prompt: {
        text: `another demo prompt for ${style}`,
        style,
        mood: 'inspired',
      },
      isPublic: true,
      isNSFW: false,
      metadata: { seed: 'retention-demo' },
      likesCount: 1,
      commentsCount: 0,
      remixCount: 0,
    });

    await this.artworkRepo.save([art1, art2]);
  }

  private async forceTimestamps(userId: string, spec: DemoUserSpec) {
    // Users.created_at (for NEW_TRIAL logic)
    if (spec.createdDaysAgo > 0) {
      await this.userRepo.query(
        'UPDATE users SET created_at = DATE_SUB(NOW(), INTERVAL ? DAY) WHERE id = ?',
        [spec.createdDaysAgo, userId],
      );
    }

    // last_login_at / previous_login_at
    const lastLoginAt =
      spec.lastLoginDaysAgo == null ? null : daysFromNow(-spec.lastLoginDaysAgo);

    let previousLoginAt: Date | null = null;
    if (lastLoginAt && spec.previousLoginGapDays && spec.previousLoginGapDays > 0) {
      previousLoginAt = new Date(lastLoginAt.getTime() - spec.previousLoginGapDays * 24 * 60 * 60 * 1000);
    }

    await this.userRepo.query(
      'UPDATE users SET last_login_at = ?, last_active_at = ?, previous_login_at = ? WHERE id = ?',
      [lastLoginAt, lastLoginAt, previousLoginAt, userId],
    );
  }
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

