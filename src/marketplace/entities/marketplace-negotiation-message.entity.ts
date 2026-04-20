import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MarketplaceNegotiation } from './marketplace-negotiation.entity';
import { User } from '../../users/user.entity';

@Entity('marketplace_negotiation_messages')
@Index(['negotiationId', 'createdAt'])
export class MarketplaceNegotiationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'negotiation_id' })
  negotiationId: string;

  @Column('uuid', { name: 'sender_id' })
  senderId: string;

  @Column({ type: 'varchar', length: 16, default: 'message' })
  type: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 6,
    nullable: true,
    name: 'offer_amount',
  })
  offerAmount: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => MarketplaceNegotiation, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'negotiation_id' })
  negotiation: MarketplaceNegotiation;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'sender_id' })
  sender: User;
}
