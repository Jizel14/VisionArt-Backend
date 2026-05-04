import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../../users/user.entity';

@Entity('conversation_participants')
@Unique(['conversationId', 'userId'])
@Index(['userId'])
export class ConversationParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'conversation_id' })
  conversationId: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'int', default: 0, name: 'unread_count' })
  unreadCount: number;

  @Column({ type: 'datetime', nullable: true, name: 'last_read_at' })
  lastReadAt: Date | null;

  @Column({ type: 'boolean', default: false, name: 'is_muted' })
  isMuted: boolean;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;

  @ManyToOne(() => Conversation, (c) => c.participants, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
