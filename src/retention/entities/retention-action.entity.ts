import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { RetentionRun } from './retention-run.entity';
import { PromoCode } from '../../promo/entities/promo-code.entity';

export enum RetentionSegment {
  NEW_TRIAL = 'NEW_TRIAL',
  ENGAGED_FREE = 'ENGAGED_FREE',
  IDLE_FREE = 'IDLE_FREE',
  POWER_USER_FREE = 'POWER_USER_FREE',
  WIN_BACK_30 = 'WIN_BACK_30',
  WIN_BACK_60 = 'WIN_BACK_60',
  LOST = 'LOST',
  RETURNING = 'RETURNING',
  LOYAL_PRO = 'LOYAL_PRO',
  CHURN_RISK_PRO = 'CHURN_RISK_PRO',
  LAPSED_PRO_3D = 'LAPSED_PRO_3D',
  LAPSED_PRO_7D = 'LAPSED_PRO_7D',
  LAPSED_PRO_30D = 'LAPSED_PRO_30D',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

export enum RetentionChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
  MULTI = 'MULTI',
}

export enum RetentionActionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export interface RetentionPayload {
  subject: string;
  preheader?: string;
  body: string;
  cta_label: string;
  tone?: 'warm' | 'urgent' | 'celebratory' | 'apologetic' | 'informative';
  source?: 'llm' | 'fallback';
}

export interface RetentionContext {
  firstName?: string;
  daysAway?: number;
  lastArtTitle?: string | null;
  topStyle?: string | null;
  loyaltyPoints?: number;
  discountPct?: number;
  promoCode?: string | null;
  totalArtworks?: number;
  monthsActive?: number;
  plan?: string;
  [key: string]: unknown;
}

@Entity('retention_actions')
@Index(['userId'])
@Index(['userId', 'segment'])
@Index(['status'])
@Index(['runId'])
export class RetentionAction {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true, nullable: true, name: 'run_id' })
  runId: string | null;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  segment: RetentionSegment;

  @Column({ type: 'varchar', length: 20 })
  channel: RetentionChannel;

  @Column({
    type: 'varchar',
    length: 20,
    default: RetentionActionStatus.PENDING,
  })
  status: RetentionActionStatus;

  @Column({ type: 'boolean', default: false, name: 'requires_review' })
  requiresReview: boolean;

  @Column({ type: 'json' })
  payload: RetentionPayload;

  @Column({ type: 'json' })
  context: RetentionContext;

  @Column({ type: 'varchar', length: 32, nullable: true, name: 'promo_code' })
  promoCode: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  variant: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'scheduled_for' })
  scheduledFor: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'sent_at' })
  sentAt: Date | null;

  @Column('uuid', { name: 'reviewed_by', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'reviewed_at' })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => RetentionRun, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'run_id' })
  run: RetentionRun | null;

  @ManyToOne(() => PromoCode, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'promo_code' })
  promo: PromoCode | null;
}
