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
import { MarketplaceWallet } from './marketplace-wallet.entity';

@Entity('marketplace_wallet_transactions')
@Index(['userId', 'createdAt'])
@Index(['walletId', 'createdAt'])
export class MarketplaceWalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'wallet_id' })
  walletId: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 24 })
  type: string;

  @Column({ type: 'varchar', length: 24, default: 'completed' })
  status: string;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 6,
  })
  amount: string;

  @Column({ type: 'varchar', length: 16, default: 'USDC' })
  currency: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => MarketplaceWallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_id' })
  wallet: MarketplaceWallet;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
