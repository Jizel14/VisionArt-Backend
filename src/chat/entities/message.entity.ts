import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../../users/user.entity';
import { MessageReaction } from './message-reaction.entity';

@Entity('messages')
@Index(['conversationId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'conversation_id' })
  conversationId: string;

  @Column('uuid', { name: 'sender_id' })
  senderId: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'text',
    comment: 'text | image | reply | system',
  })
  type: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'image_url' })
  imageUrl: string | null;

  @Column('uuid', { nullable: true, name: 'reply_to_id' })
  replyToId: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_edited' })
  isEdited: boolean;

  @Column({ type: 'boolean', default: false, name: 'is_deleted' })
  isDeleted: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, name: 'edited_at' })
  editedAt: Date | null;

  @ManyToOne(() => Conversation, (c) => c.messages, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @ManyToOne(() => Message, { onDelete: 'SET NULL', eager: false, nullable: true })
  @JoinColumn({ name: 'reply_to_id' })
  replyTo: Message | null;

  @OneToMany(() => MessageReaction, (r) => r.message, { eager: false })
  reactions: MessageReaction[];
}
