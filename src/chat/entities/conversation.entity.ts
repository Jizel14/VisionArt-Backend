import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ConversationParticipant } from './conversation-participant.entity';
import { Message } from './message.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'boolean', default: false, name: 'is_group' })
  isGroup: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'group_name' })
  groupName: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'group_avatar_url',
  })
  groupAvatarUrl: string | null;

  @Column('uuid', { nullable: true, name: 'created_by' })
  createdBy: string | null;

  @Index()
  @Column({ type: 'datetime', nullable: true, name: 'last_message_at' })
  lastMessageAt: Date | null;

  @Column({ type: 'text', nullable: true, name: 'last_message_preview' })
  lastMessagePreview: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ConversationParticipant, (p) => p.conversation, {
    eager: false,
  })
  participants: ConversationParticipant[];

  @OneToMany(() => Message, (m) => m.conversation, { eager: false })
  messages: Message[];
}
