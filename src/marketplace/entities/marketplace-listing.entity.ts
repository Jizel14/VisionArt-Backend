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
import { Artwork } from '../../social/artworks/entities/artwork.entity';
import { User } from '../../users/user.entity';

@Entity('marketplace_listings')
@Index(['isActive', 'createdAt'])
@Index(['sellerId', 'createdAt'])
@Index(['artworkId', 'isActive'])
export class MarketplaceListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'artwork_id' })
  artworkId: string;

  @Column('uuid', { name: 'seller_id' })
  sellerId: string;

  @Column('uuid', { name: 'buyer_id', nullable: true })
  buyerId: string | null;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 6,
  })
  price: string;

  @Column({ type: 'varchar', length: 16, default: 'USDC' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'payment_token',
  })
  paymentToken: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  negotiable: boolean;

  @Column({ type: 'varchar', length: 24, default: 'listed' })
  status: string;

  @Column({ type: 'varchar', length: 120, nullable: true, name: 'tx_hash' })
  txHash: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'sold_at' })
  soldAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Artwork, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'artwork_id' })
  artwork: Artwork;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL', eager: false, nullable: true })
  @JoinColumn({ name: 'buyer_id' })
  buyer: User | null;
}
