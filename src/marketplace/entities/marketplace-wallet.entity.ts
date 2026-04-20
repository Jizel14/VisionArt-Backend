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

@Entity('marketplace_wallets')
@Index(['userId'], { unique: true })
export class MarketplaceWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 6,
    default: 0,
    name: 'available_balance',
  })
  availableBalance: string;

  @Column({ type: 'varchar', length: 16, default: 'USDC' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    name: 'wallet_address',
  })
  walletAddress: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
