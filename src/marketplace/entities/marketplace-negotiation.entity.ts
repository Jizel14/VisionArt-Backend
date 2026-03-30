import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MarketplaceListing } from './marketplace-listing.entity';
import { User } from '../../users/user.entity';

@Entity('marketplace_negotiations')
@Index(['listingId', 'requesterId'])
@Index(['sellerId', 'status', 'createdAt'])
@Index(['requesterId', 'status', 'createdAt'])
export class MarketplaceNegotiation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'listing_id' })
  listingId: string;

  @Column('uuid', { name: 'requester_id' })
  requesterId: string;

  @Column('uuid', { name: 'seller_id' })
  sellerId: string;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: string;

  @Column({ type: 'decimal', precision: 24, scale: 6, name: 'initial_amount' })
  initialAmount: string;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 6,
    nullable: true,
    name: 'latest_amount',
  })
  latestAmount: string | null;

  @Column({ type: 'varchar', length: 16, default: 'USDC' })
  currency: string;

  @Column({ type: 'text', nullable: true, name: 'initial_message' })
  initialMessage: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'accepted_at' })
  acceptedAt: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'closed_at' })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => MarketplaceListing, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'listing_id' })
  listing: MarketplaceListing;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'seller_id' })
  seller: User;
}
