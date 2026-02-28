import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ArtworkComment } from './artwork-comment.entity';
import { User } from '../../../users/user.entity';

@Entity('artwork_comment_mentions')
@Index(['commentId'])
@Index(['mentionedUserId'])
@Index(['commentId', 'mentionedUserId'], { unique: true })
export class ArtworkCommentMention {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'comment_id' })
  commentId: string;

  @Column('uuid', { name: 'mentioned_user_id' })
  mentionedUserId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => ArtworkComment, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'comment_id' })
  comment: ArtworkComment;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'mentioned_user_id' })
  mentionedUser: User;
}
