import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';

@Entity('promo_codes')
@Index(['segment'])
@Index(['validUntil'])
export class PromoCode {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 32 })
  segment: string;

  @Column('uuid', { name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ type: 'int', default: 0, name: 'discount_pct' })
  discountPct: number;

  @Column({ type: 'int', default: 0, name: 'free_months' })
  freeMonths: number;

  @Column({ type: 'datetime', name: 'valid_until' })
  validUntil: Date;

  @Column({ type: 'int', default: 1, name: 'max_uses' })
  maxUses: number;

  @Column({ type: 'int', default: 0, name: 'used_count' })
  usedCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}
