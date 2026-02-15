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

@Entity('user_followers')
@Index(['followerId', 'followingId'], { unique: true })
export class UserFollower {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'follower_id' })
  followerId: string;

  @Column('uuid', { name: 'following_id' })
  followingId: string;

  @CreateDateColumn({ name: 'followed_at' })
  followedAt: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'follower_id' })
  follower: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'following_id' })
  following: User;
}
