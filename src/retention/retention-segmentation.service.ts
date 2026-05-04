import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  RetentionSegment,
  RetentionContext,
} from './entities/retention-action.entity';

export interface SegmentedUser {
  userId: string;
  email: string;
  name: string;
  segment: RetentionSegment;
  context: RetentionContext;
}

/**
 * Pure-SQL segmentation. No LLM, no business logic in JS — just deterministic
 * rules over `users`, `subscriptions`, `artworks`, `loyalty_points`.
 *
 * Segments are mutually exclusive: the CASE expression below picks the most
 * specific one. Order matters.
 */
@Injectable()
export class RetentionSegmentationService {
  private readonly logger = new Logger(RetentionSegmentationService.name);

  constructor(private readonly dataSource: DataSource) {}

  async segmentAllUsers(): Promise<SegmentedUser[]> {
    // Single pass over the users table joined with subscriptions + artworks
    // aggregations. Returns at most a few hundred actionable rows per day.
    const rows: Array<{
      user_id: string;
      email: string;
      name: string;
      segment: string | null;
      first_name: string;
      days_since_login: number | null;
      days_since_signup: number;
      gap_before_return: number | null;
      plan: string;
      sub_status: string;
      generations_used: number;
      quota_limit: number | null;
      total_artworks: number;
      last_artwork_title: string | null;
      top_style: string | null;
      loyalty_points: number;
      months_active: number;
      current_period_end: Date | null;
      marketing_opt_in: number;
    }> = await this.dataSource.query(`
      WITH user_stats AS (
        SELECT
          u.id AS user_id,
          u.email,
          u.name,
          u.created_at,
          u.last_login_at,
          u.previous_login_at,
          u.marketing_opt_in,
          DATEDIFF(NOW(), u.last_login_at) AS days_since_login,
          DATEDIFF(NOW(), u.created_at) AS days_since_signup,
          CASE
            WHEN u.previous_login_at IS NOT NULL AND u.last_login_at IS NOT NULL
            THEN DATEDIFF(u.last_login_at, u.previous_login_at)
            ELSE NULL
          END AS gap_before_return,
          COALESCE(s.plan, 'free') AS plan,
          COALESCE(s.status, 'active') AS sub_status,
          COALESCE(s.generations_used_this_month, 0) AS generations_used,
          CASE WHEN s.plan = 'pro' THEN NULL ELSE 10 END AS quota_limit,
          s.current_period_end,
          TIMESTAMPDIFF(MONTH, COALESCE(s.created_at, u.created_at), NOW()) AS months_active,
          COALESCE(lp.balance, 0) AS loyalty_points
        FROM users u
        LEFT JOIN subscriptions s ON s.user_id = u.id
        LEFT JOIN loyalty_points lp ON lp.user_id = u.id
        WHERE u.is_admin = 0
      ),
      artwork_stats AS (
        SELECT
          a.user_id,
          COUNT(*) AS total_artworks,
          MAX(a.created_at) AS last_artwork_at
        FROM artworks a
        GROUP BY a.user_id
      ),
      last_artwork AS (
        SELECT
          a.user_id,
          a.title AS last_artwork_title
        FROM artworks a
        INNER JOIN (
          SELECT user_id, MAX(created_at) AS mx
          FROM artworks
          GROUP BY user_id
        ) m ON m.user_id = a.user_id AND m.mx = a.created_at
      ),
      top_style AS (
        SELECT
          a.user_id,
          JSON_UNQUOTE(JSON_EXTRACT(a.prompt, '$.style')) AS style,
          COUNT(*) AS c
        FROM artworks a
        WHERE a.prompt IS NOT NULL
        GROUP BY a.user_id, style
      ),
      top_style_pick AS (
        SELECT
          ts.user_id,
          ts.style AS top_style
        FROM top_style ts
        INNER JOIN (
          SELECT user_id, MAX(c) AS mx FROM top_style GROUP BY user_id
        ) m ON m.user_id = ts.user_id AND m.mx = ts.c
      )
      SELECT
        us.user_id,
        us.email,
        us.name,
        SUBSTRING_INDEX(us.name, ' ', 1) AS first_name,
        us.days_since_login,
        us.days_since_signup,
        us.gap_before_return,
        us.plan,
        us.sub_status,
        us.generations_used,
        us.quota_limit,
        COALESCE(asx.total_artworks, 0) AS total_artworks,
        la.last_artwork_title,
        tsp.top_style,
        us.loyalty_points,
        us.months_active,
        us.current_period_end,
        us.marketing_opt_in,
        CASE
          /* PRO billing problems first — transactional, not promotional */
          WHEN us.sub_status = 'past_due' THEN 'PAYMENT_FAILED'

          /* Lapsed PRO buckets (canceled / inactive subscription) */
          WHEN us.plan = 'free'
            AND us.sub_status IN ('canceled', 'inactive')
            AND us.current_period_end IS NOT NULL
            AND DATEDIFF(NOW(), us.current_period_end) BETWEEN 1 AND 3
            THEN 'LAPSED_PRO_3D'
          WHEN us.plan = 'free'
            AND us.sub_status IN ('canceled', 'inactive')
            AND us.current_period_end IS NOT NULL
            AND DATEDIFF(NOW(), us.current_period_end) BETWEEN 4 AND 14
            THEN 'LAPSED_PRO_7D'
          WHEN us.plan = 'free'
            AND us.sub_status IN ('canceled', 'inactive')
            AND us.current_period_end IS NOT NULL
            AND DATEDIFF(NOW(), us.current_period_end) > 14
            AND DATEDIFF(NOW(), us.current_period_end) <= 60
            THEN 'LAPSED_PRO_30D'

          /* Active PRO sub-segments */
          WHEN us.plan = 'pro' AND us.sub_status = 'active'
            AND us.current_period_end IS NOT NULL
            AND DATEDIFF(us.current_period_end, NOW()) <= 7
            AND (us.days_since_login IS NULL OR us.days_since_login >= 14)
            THEN 'CHURN_RISK_PRO'
          WHEN us.plan = 'pro' AND us.sub_status = 'active'
            AND us.months_active >= 3
            AND (us.days_since_login IS NOT NULL AND us.days_since_login <= 7)
            THEN 'LOYAL_PRO'

          /* Returning user (came back after 30+ day gap) */
          WHEN us.days_since_login IS NOT NULL
            AND us.days_since_login <= 7
            AND us.gap_before_return IS NOT NULL
            AND us.gap_before_return >= 30
            THEN 'RETURNING'

          /* Win-back ladders (ordered by severity) */
          WHEN us.days_since_login IS NOT NULL
            AND us.days_since_login > 90
            THEN 'LOST'
          WHEN us.days_since_login IS NOT NULL
            AND us.days_since_login BETWEEN 60 AND 90
            THEN 'WIN_BACK_60'
          WHEN us.days_since_login IS NOT NULL
            AND us.days_since_login BETWEEN 30 AND 59
            THEN 'WIN_BACK_30'

          /* New trial — first week, never paid */
          WHEN us.plan = 'free'
            AND us.days_since_signup <= 7
            AND us.days_since_login IS NOT NULL
            AND us.days_since_login <= 7
            THEN 'NEW_TRIAL'

          /* Power user FREE — exceeded quota at least once */
          WHEN us.plan = 'free'
            AND us.generations_used >= 10
            AND (us.days_since_login IS NULL OR us.days_since_login <= 7)
            THEN 'POWER_USER_FREE'

          /* Engaged FREE close to quota */
          WHEN us.plan = 'free'
            AND us.generations_used >= 7
            AND (us.days_since_login IS NULL OR us.days_since_login <= 7)
            THEN 'ENGAGED_FREE'

          /* Idle FREE — disengaging */
          WHEN us.plan = 'free'
            AND us.days_since_login IS NOT NULL
            AND us.days_since_login BETWEEN 14 AND 29
            THEN 'IDLE_FREE'

          ELSE NULL
        END AS segment
      FROM user_stats us
      LEFT JOIN artwork_stats asx ON asx.user_id = us.user_id
      LEFT JOIN last_artwork la ON la.user_id = us.user_id
      LEFT JOIN top_style_pick tsp ON tsp.user_id = us.user_id
      HAVING segment IS NOT NULL
    `);

    return rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: r.name,
      segment: r.segment as RetentionSegment,
      context: {
        firstName: r.first_name || r.name,
        daysAway: r.days_since_login ?? undefined,
        lastArtTitle: r.last_artwork_title,
        topStyle: r.top_style,
        loyaltyPoints: Number(r.loyalty_points),
        totalArtworks: Number(r.total_artworks),
        monthsActive: Number(r.months_active),
        plan: r.plan,
        marketingOptIn: r.marketing_opt_in === 1,
      } as RetentionContext,
    }));
  }

  /**
   * Returns segments that should never be auto-sent without admin review.
   * These usually carry brand or revenue risk.
   */
  static readonly REVIEW_REQUIRED_SEGMENTS: ReadonlySet<RetentionSegment> =
    new Set([
      RetentionSegment.LOYAL_PRO,
      RetentionSegment.LAPSED_PRO_30D,
    ]);

  static readonly DISCOUNT_BY_SEGMENT: Record<RetentionSegment, number> = {
    [RetentionSegment.NEW_TRIAL]: 0,
    [RetentionSegment.ENGAGED_FREE]: 20,
    [RetentionSegment.IDLE_FREE]: 0,
    [RetentionSegment.POWER_USER_FREE]: 25,
    [RetentionSegment.WIN_BACK_30]: 30,
    [RetentionSegment.WIN_BACK_60]: 40,
    [RetentionSegment.LOST]: 50,
    [RetentionSegment.RETURNING]: 0,
    [RetentionSegment.LOYAL_PRO]: 0,
    [RetentionSegment.CHURN_RISK_PRO]: 25,
    [RetentionSegment.LAPSED_PRO_3D]: 0,
    [RetentionSegment.LAPSED_PRO_7D]: 30,
    [RetentionSegment.LAPSED_PRO_30D]: 50,
    [RetentionSegment.PAYMENT_FAILED]: 0,
  };
}
