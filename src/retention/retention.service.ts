import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { NotificationsService } from '../social/notifications/notifications.service';
import { NotificationType } from '../social/notifications/entities/user-notification.entity';
import { PromoService } from '../promo/promo.service';
import {
  RetentionRun,
  RetentionRunStatus,
} from './entities/retention-run.entity';
import {
  RetentionAction,
  RetentionActionStatus,
  RetentionChannel,
  RetentionContext,
  RetentionPayload,
  RetentionSegment,
} from './entities/retention-action.entity';
import {
  RetentionEvent,
  RetentionEventType,
} from './entities/retention-event.entity';
import {
  RetentionSegmentationService,
  SegmentedUser,
} from './retention-segmentation.service';
import { RetentionMessageService } from './retention-message.service';
import { RetentionMailerService } from './retention-mailer.service';

const REPLAY_THROTTLE_DAYS = 14; // never resend same segment to same user within 14 days
const PAYMENT_FAILED_THROTTLE_DAYS = 3; // payment_failed is transactional, can repeat sooner

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly publicAppUrl: string;

  constructor(
    @InjectRepository(RetentionRun)
    private readonly runRepo: Repository<RetentionRun>,
    @InjectRepository(RetentionAction)
    private readonly actionRepo: Repository<RetentionAction>,
    @InjectRepository(RetentionEvent)
    private readonly eventRepo: Repository<RetentionEvent>,
    private readonly dataSource: DataSource,
    private readonly segmentation: RetentionSegmentationService,
    private readonly messages: RetentionMessageService,
    private readonly mailer: RetentionMailerService,
    private readonly promo: PromoService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {
    this.publicAppUrl =
      this.config.get<string>('PUBLIC_APP_URL') ||
      'https://visionart.app';
  }

  // ── Cron: every day at 09:00 server time ──────────────────────────────────

  @Cron('0 9 * * *')
  async runDaily(): Promise<RetentionRun> {
    return this.runOnce({ trigger: 'cron-daily' });
  }

  /**
   * Queue processor for manual runs requested from the backoffice.
   * This avoids any backend-to-backoffice auth coupling (2-token architecture).
   *
   * Backoffice inserts a row into `retention_runs` with status=QUEUED.
   * Backend claims and executes it here.
   */
  @Cron('*/1 * * * *')
  async processQueuedRuns(): Promise<void> {
    // Claim exactly one queued run (skip locked via atomic update)
    const queued = await this.runRepo.findOne({
      where: { status: RetentionRunStatus.QUEUED },
      order: { startedAt: 'ASC' },
    });
    if (!queued) return;

    const claimed = await this.runRepo.update(
      { id: queued.id, status: RetentionRunStatus.QUEUED },
      { status: RetentionRunStatus.RUNNING },
    );
    if (!claimed.affected) return;

    const dryRun = !!(queued.summary as any)?.dryRun;
    const trigger = String((queued.summary as any)?.trigger || 'backoffice-queued');

    try {
      await this.executeRun(queued, { trigger, dryRun });
    } catch (e) {
      this.logger.error(
        `Queued retention run ${queued.id} failed: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Dispatcher for admin-approved actions.
   * When the backoffice flips an action to APPROVED, backend will send it here.
   */
  @Cron('*/2 * * * *')
  async dispatchApprovedActions(): Promise<void> {
    const batch = await this.actionRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'user')
      .where('a.status = :st', { st: RetentionActionStatus.APPROVED })
      .andWhere('a.sent_at IS NULL')
      .orderBy('a.created_at', 'ASC')
      .limit(25)
      .getMany();
    if (batch.length === 0) return;

    for (const action of batch) {
      try {
        await this.dispatchAction(action, {
          userId: action.userId,
          email: action.user?.email ?? '',
        });
      } catch (e) {
        this.logger.warn(
          `Failed dispatch approved action ${action.id}: ${(e as Error).message}`,
        );
      }
    }
  }

  /**
   * Manual trigger (admin-initiated). Same flow as the cron.
   */
  async runOnce(options: {
    trigger: string;
    dryRun?: boolean;
  }): Promise<RetentionRun> {
    const run = this.runRepo.create({
      status: RetentionRunStatus.RUNNING,
      summary: { trigger: options.trigger, dryRun: !!options.dryRun },
    });
    await this.runRepo.save(run);

    try {
      await this.executeRun(run, options);
      return await this.runRepo.findOneOrFail({ where: { id: run.id } });
    } catch (err) {
      run.status = RetentionRunStatus.FAILED;
      run.finishedAt = new Date();
      run.errorMessage = (err as Error).message;
      await this.runRepo.save(run);
      this.logger.error(`Retention run ${run.id} failed: ${run.errorMessage}`);
      throw err;
    }
  }

  private async executeRun(
    run: RetentionRun,
    options: { trigger: string; dryRun?: boolean },
  ): Promise<void> {
    // Ensure run has correct metadata
    run.summary = { ...(run.summary ?? {}), trigger: options.trigger, dryRun: !!options.dryRun };
    await this.runRepo.save(run);

    const segmented = await this.segmentation.segmentAllUsers();
    this.logger.log(`Retention run ${run.id}: ${segmented.length} users segmented`);

    const segmentCounts: Record<string, number> = {};
    let actionsCreated = 0;
    let skipped = 0;

    for (const user of segmented) {
      segmentCounts[user.segment] = (segmentCounts[user.segment] ?? 0) + 1;

      const skip = await this.shouldSkip(user);
      if (skip) {
        skipped++;
        continue;
      }

      const action = await this.buildAndPersistAction(run, user, options.dryRun);
      if (!action) {
        skipped++;
        continue;
      }
      actionsCreated++;

      // Auto-send if not flagged for review
      if (!action.requiresReview && !options.dryRun) {
        await this.dispatchAction(action, user);
      }
    }

    run.totalUsers = segmented.length;
    run.totalActions = actionsCreated;
    run.status = RetentionRunStatus.SUCCESS;
    run.finishedAt = new Date();
    run.summary = {
      ...((run.summary as object) ?? {}),
      segmentCounts,
      actionsCreated,
      skipped,
    };
    await this.runRepo.save(run);
    this.logger.log(
      `Retention run ${run.id} completed: ${actionsCreated} actions, ${skipped} skipped`,
    );
  }

  // ── Skip rules ────────────────────────────────────────────────────────────

  private async shouldSkip(user: SegmentedUser): Promise<boolean> {
    // RGPD: marketing opt-in (transactional segments are exempt)
    const transactional = new Set<RetentionSegment>([
      RetentionSegment.PAYMENT_FAILED,
    ]);
    if (
      !transactional.has(user.segment) &&
      user.context.marketingOptIn === false
    ) {
      return true;
    }

    // Throttle: did we already send to this user recently?
    const throttleDays = transactional.has(user.segment)
      ? PAYMENT_FAILED_THROTTLE_DAYS
      : REPLAY_THROTTLE_DAYS;
    const since = new Date();
    since.setDate(since.getDate() - throttleDays);

    const recent = await this.actionRepo
      .createQueryBuilder('a')
      .where('a.user_id = :uid', { uid: user.userId })
      .andWhere('a.segment = :seg', { seg: user.segment })
      .andWhere('a.created_at >= :since', { since })
      .andWhere('a.status IN (:...statuses)', {
        statuses: [
          RetentionActionStatus.SENT,
          RetentionActionStatus.PENDING,
          RetentionActionStatus.APPROVED,
        ],
      })
      .getCount();
    if (recent > 0) return true;

    return false;
  }

  // ── Build + persist a single action ───────────────────────────────────────

  private async buildAndPersistAction(
    run: RetentionRun,
    user: SegmentedUser,
    dryRun?: boolean,
  ): Promise<RetentionAction | null> {
    const requiresReview =
      RetentionSegmentationService.REVIEW_REQUIRED_SEGMENTS.has(user.segment);
    const discountPct =
      RetentionSegmentationService.DISCOUNT_BY_SEGMENT[user.segment] ?? 0;

    let promoCode: string | null = null;
    if (discountPct > 0 && !dryRun) {
      const issued = await this.promo.issueCode({
        segment: user.segment,
        userId: user.userId,
        discountPct,
        validForDays: 14,
        maxUses: 1,
      });
      promoCode = issued.code;
    }

    const ctx: RetentionContext = {
      ...user.context,
      discountPct,
      promoCode,
    };

    const variant = this.pickVariant(user.segment);
    const payload: RetentionPayload = await this.messages.buildMessage(
      user.segment,
      ctx,
      variant,
    );

    const channel = this.pickChannel(user.segment);

    const action = this.actionRepo.create({
      runId: run.id,
      userId: user.userId,
      segment: user.segment,
      channel,
      status: dryRun
        ? RetentionActionStatus.SKIPPED
        : requiresReview
          ? RetentionActionStatus.PENDING
          : RetentionActionStatus.APPROVED,
      requiresReview,
      payload,
      context: ctx,
      promoCode,
      variant,
    });

    return this.actionRepo.save(action);
  }

  private pickChannel(segment: RetentionSegment): RetentionChannel {
    // Transactional → email; soft engagement → in-app
    if (segment === RetentionSegment.PAYMENT_FAILED) return RetentionChannel.EMAIL;
    if (
      segment === RetentionSegment.LAPSED_PRO_3D ||
      segment === RetentionSegment.LAPSED_PRO_7D ||
      segment === RetentionSegment.LAPSED_PRO_30D ||
      segment === RetentionSegment.WIN_BACK_30 ||
      segment === RetentionSegment.WIN_BACK_60 ||
      segment === RetentionSegment.LOST
    ) {
      return RetentionChannel.MULTI;
    }
    return RetentionChannel.IN_APP;
  }

  private pickVariant(_segment: RetentionSegment): string {
    // Simple 50/50 A/B between warm and urgent — extendable later.
    return Math.random() < 0.5 ? 'warm' : 'urgent';
  }

  // ── Dispatch (in-app + email) ─────────────────────────────────────────────

  async dispatchAction(
    action: RetentionAction,
    user: { email: string; userId: string },
  ): Promise<void> {
    const wantInApp =
      action.channel === RetentionChannel.IN_APP ||
      action.channel === RetentionChannel.MULTI;
    const wantEmail =
      action.channel === RetentionChannel.EMAIL ||
      action.channel === RetentionChannel.MULTI;

    let inAppOk = true;
    let emailResult: { ok: boolean; providerId?: string; error?: string } = {
      ok: true,
    };

    if (wantInApp) {
      try {
        await this.notifications.createNotification({
          userId: user.userId,
          type: NotificationType.SYSTEM,
          title: action.payload.subject.slice(0, 160),
          message: action.payload.body,
        });
      } catch (e) {
        inAppOk = false;
        this.logger.warn(`In-app notif failed: ${(e as Error).message}`);
      }
    }

    if (wantEmail && user.email) {
      const unsubscribeUrl = `${this.publicAppUrl}/unsubscribe?u=${user.userId}&t=${action.id}`;
      const trackingPixelUrl = `${this.publicAppUrl}/api/retention/track/open/${action.id}.gif`;
      emailResult = await this.mailer.send({
        to: user.email,
        subject: action.payload.subject,
        preheader: action.payload.preheader,
        bodyText: action.payload.body,
        bodyHtml: this.renderHtml(action, trackingPixelUrl, unsubscribeUrl),
        unsubscribeUrl,
        trackingPixelUrl,
      });
    }

    const ok = inAppOk && (!wantEmail || emailResult.ok);

    action.status = ok
      ? RetentionActionStatus.SENT
      : RetentionActionStatus.FAILED;
    action.sentAt = new Date();
    await this.actionRepo.save(action);

    await this.eventRepo.save(
      this.eventRepo.create({
        actionId: action.id,
        type: RetentionEventType.DELIVERED,
        metadata: {
          inApp: inAppOk,
          email: emailResult.ok ? emailResult.providerId : emailResult.error,
        },
      }),
    );
  }

  private renderHtml(
    action: RetentionAction,
    trackingPixelUrl: string,
    unsubscribeUrl: string,
  ): string {
    const cta = `${this.publicAppUrl}/api/retention/track/click/${action.id}?to=${encodeURIComponent(this.publicAppUrl)}`;
    const safeBody = action.payload.body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f6f7fb;margin:0;padding:32px">
<table role="presentation" align="center" width="540" style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.04)">
<tr><td>
  <h1 style="font-size:20px;color:#1a1a2e;margin:0 0 16px">${action.payload.subject}</h1>
  <p style="font-size:15px;line-height:1.55;color:#3a3a4f;white-space:pre-line">${safeBody}</p>
  <p style="margin:24px 0">
    <a href="${cta}" style="display:inline-block;background:#6c63ff;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">${action.payload.cta_label}</a>
  </p>
  <p style="font-size:12px;color:#8a8aa3;margin-top:32px">
    <a href="${unsubscribeUrl}" style="color:#8a8aa3">Se désinscrire</a>
  </p>
</td></tr>
</table>
<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none">
</body></html>`;
  }

  // ── Admin review actions ──────────────────────────────────────────────────

  async approveAction(
    actionId: string,
    adminId: string,
  ): Promise<RetentionAction> {
    const action = await this.actionRepo.findOne({
      where: { id: actionId },
      relations: ['user'],
    });
    if (!action) throw new Error(`Action ${actionId} not found`);

    action.status = RetentionActionStatus.APPROVED;
    action.reviewedBy = adminId;
    action.reviewedAt = new Date();
    await this.actionRepo.save(action);

    if (action.user) {
      await this.dispatchAction(action, {
        email: action.user.email,
        userId: action.userId,
      });
    }
    return action;
  }

  async rejectAction(
    actionId: string,
    adminId: string,
    reason?: string,
  ): Promise<RetentionAction> {
    const action = await this.actionRepo.findOne({ where: { id: actionId } });
    if (!action) throw new Error(`Action ${actionId} not found`);
    action.status = RetentionActionStatus.REJECTED;
    action.reviewedBy = adminId;
    action.reviewedAt = new Date();
    if (reason) {
      action.context = { ...action.context, reviewReason: reason };
    }
    return this.actionRepo.save(action);
  }

  async editPayload(
    actionId: string,
    adminId: string,
    payload: Partial<RetentionPayload>,
  ): Promise<RetentionAction> {
    const action = await this.actionRepo.findOne({ where: { id: actionId } });
    if (!action) throw new Error(`Action ${actionId} not found`);
    action.payload = { ...action.payload, ...payload, source: 'llm' };
    action.reviewedBy = adminId;
    action.reviewedAt = new Date();
    return this.actionRepo.save(action);
  }

  // ── Tracking ──────────────────────────────────────────────────────────────

  async trackEvent(
    actionId: string,
    type: RetentionEventType,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.eventRepo.save(
      this.eventRepo.create({ actionId, type, metadata: metadata ?? null }),
    );
  }

  async unsubscribeUser(userId: string): Promise<void> {
    await this.dataSource.query(
      'UPDATE users SET marketing_opt_in = 0 WHERE id = ?',
      [userId],
    );
  }

  // ── Stripe webhook hooks (called from SubscriptionsService) ───────────────

  /**
   * Schedule LAPSED_PRO_3D ~immediately when Stripe reports a subscription
   * cancellation. The cron will then promote it through the LAPSED ladder.
   */
  async onSubscriptionCanceled(userId: string): Promise<void> {
    this.logger.log(
      `Stripe webhook: subscription canceled for user ${userId} — flagged for next retention run`,
    );
  }

  // ── Public read helpers (used by controller + backoffice) ────────────────

  async getRecentRuns(limit = 30) {
    return this.runRepo.find({
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async listPendingReview(limit = 50) {
    return this.actionRepo.find({
      where: { status: RetentionActionStatus.PENDING },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Aggregated KPI for the backoffice dashboard.
   */
  async getKpis() {
    const since30d = new Date();
    since30d.setDate(since30d.getDate() - 30);
    const since7d = new Date();
    since7d.setDate(since7d.getDate() - 7);

    const [actionsLast30d, actionsLast7d, openedLast30d, clickedLast30d, convertedLast30d, pendingReview] =
      await Promise.all([
        this.actionRepo
          .createQueryBuilder('a')
          .where('a.created_at >= :s', { s: since30d })
          .getCount(),
        this.actionRepo
          .createQueryBuilder('a')
          .where('a.created_at >= :s', { s: since7d })
          .getCount(),
        this.eventRepo
          .createQueryBuilder('e')
          .where('e.created_at >= :s', { s: since30d })
          .andWhere('e.type = :t', { t: RetentionEventType.OPENED })
          .getCount(),
        this.eventRepo
          .createQueryBuilder('e')
          .where('e.created_at >= :s', { s: since30d })
          .andWhere('e.type = :t', { t: RetentionEventType.CLICKED })
          .getCount(),
        this.eventRepo
          .createQueryBuilder('e')
          .where('e.created_at >= :s', { s: since30d })
          .andWhere('e.type = :t', { t: RetentionEventType.CONVERTED })
          .getCount(),
        this.actionRepo
          .createQueryBuilder('a')
          .where('a.status = :st', { st: RetentionActionStatus.PENDING })
          .getCount(),
      ]);

    // Revenue saved estimate: each CONVERTED is worth one PRO month
    // PRO price defaulted to 9.99 unless override
    const proMonthlyEur = Number(this.config.get('PRO_MONTHLY_EUR') ?? 9.99);
    const revenueSavedEur30d = convertedLast30d * proMonthlyEur;

    const segments = await this.actionRepo
      .createQueryBuilder('a')
      .select('a.segment', 'segment')
      .addSelect('COUNT(*)', 'count')
      .where('a.created_at >= :s', { s: since7d })
      .groupBy('a.segment')
      .orderBy('count', 'DESC')
      .getRawMany<{ segment: string; count: string }>();

    return {
      actionsLast7d,
      actionsLast30d,
      openRate30d: actionsLast30d > 0 ? openedLast30d / actionsLast30d : 0,
      clickRate30d: actionsLast30d > 0 ? clickedLast30d / actionsLast30d : 0,
      conversionRate30d:
        actionsLast30d > 0 ? convertedLast30d / actionsLast30d : 0,
      revenueSavedEur30d,
      pendingReview,
      segmentsLast7d: segments.map((s) => ({
        segment: s.segment,
        count: Number(s.count),
      })),
    };
  }
}
