import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum LoyaltyEventType {
  LOGIN_DAILY = 'LOGIN_DAILY',
  ARTWORK_CREATED = 'ARTWORK_CREATED',
  LIKE_RECEIVED = 'LIKE_RECEIVED',
  COMMENT_RECEIVED = 'COMMENT_RECEIVED',
  REFERRAL = 'REFERRAL',
  RENEWAL = 'RENEWAL',
  REDEMPTION = 'REDEMPTION',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
}

@Entity('loyalty_events')
@Index(['userId'])
@Index(['createdAt'])
export class LoyaltyEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 40 })
  type: LoyaltyEventType;

  @Column({ type: 'int' })
  delta: number;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'ref_id' })
  refId: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
