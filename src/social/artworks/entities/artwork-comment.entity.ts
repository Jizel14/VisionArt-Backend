import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../users/user.entity';
import { Artwork } from './artwork.entity';

@Entity('artwork_comments')
@Index(['artworkId'])
@Index(['userId'])
@Index(['parentCommentId'])
export class ArtworkComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('uuid', { name: 'artwork_id' })
  artworkId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'boolean', default: false, name: 'is_edited' })
  isEdited: boolean;

  @Column('uuid', { nullable: true, name: 'parent_comment_id' })
  parentCommentId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Artwork, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'artwork_id' })
  artwork: Artwork;

  @ManyToOne(() => ArtworkComment, {
    nullable: true,
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'parent_comment_id' })
  parentComment: ArtworkComment | null;
}
