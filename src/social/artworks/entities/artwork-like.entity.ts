import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../../users/user.entity';
import { Artwork } from './artwork.entity';

@Entity('artwork_likes')
@Index(['artworkId'])
@Index(['userId'])
@Index(['userId', 'artworkId'], { unique: true })
export class ArtworkLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column('uuid', { name: 'artwork_id' })
  artworkId: string;

  @CreateDateColumn({ name: 'liked_at' })
  likedAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Artwork, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'artwork_id' })
  artwork: Artwork;
}
