import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RetentionAction } from './retention-action.entity';

export enum RetentionEventType {
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  CLICKED = 'CLICKED',
  CONVERTED = 'CONVERTED',
  UNSUBSCRIBED = 'UNSUBSCRIBED',
  BOUNCED = 'BOUNCED',
}

@Entity('retention_events')
@Index(['actionId'])
@Index(['type'])
export class RetentionEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'bigint', unsigned: true, name: 'action_id' })
  actionId: string;

  @Column({ type: 'varchar', length: 20 })
  type: RetentionEventType;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => RetentionAction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: RetentionAction;
}
