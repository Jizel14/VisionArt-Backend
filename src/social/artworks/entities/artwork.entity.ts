import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from '../../../users/user.entity';
import { ArtworkLike } from './artwork-like.entity';
import { ArtworkComment } from './artwork-comment.entity';

@Entity('artworks')
@Index(['userId', 'isPublic', 'createdAt'])
@Index(['isPublic', 'createdAt'])
@Index(['remixedFromId'])
export class Artwork {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, name: 'image_url' })
  imageUrl: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'thumbnail_url',
  })
  thumbnailUrl: string | null;

  @Column({ type: 'json', nullable: true })
  prompt: object | null;

  @Column({ type: 'boolean', default: false, name: 'is_public' })
  isPublic: boolean;

  @Column({ type: 'boolean', default: false, name: 'is_nsfw' })
  isNSFW: boolean;

  @Column({ type: 'int', default: 0, name: 'likes_count' })
  likesCount: number;

  @Column({ type: 'int', default: 0, name: 'comments_count' })
  commentsCount: number;

  @Column({ type: 'int', default: 0, name: 'remix_count' })
  remixCount: number;

  @Column('uuid', { nullable: true, name: 'remixed_from_id' })
  remixedFromId: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: object | null;

  @Column({ type: 'json', nullable: true, name: 'context_data' })
  contextData: object | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Artwork, {
    nullable: true,
    onDelete: 'SET NULL',
    eager: false,
  })
  @JoinColumn({ name: 'remixed_from_id' })
  remixedFrom: Artwork | null;

  @OneToMany(() => ArtworkLike, (like) => like.artwork)
  likes: ArtworkLike[];

  @OneToMany(() => ArtworkComment, (comment) => comment.artwork)
  comments: ArtworkComment[];
}
