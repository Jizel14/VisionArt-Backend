import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../../users/user.entity';
import { Artwork } from '../../artworks/entities/artwork.entity';

export enum ReportReason {
  INAPPROPRIATE = 'inappropriate',
  COPYRIGHT = 'copyright',
  NSFW = 'nsfw',
  SPAM = 'spam',
  OTHER = 'other',
}

export enum ReportStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Entity('artwork_reports')
export class ArtworkReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'artwork_id' })
  artworkId: string;

  @Column('uuid', { name: 'reporter_id' })
  reporterId: string;

  @Column({
    type: 'enum',
    enum: ReportReason,
  })
  reason: ReportReason;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.PENDING,
  })
  status: ReportStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => Artwork, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'artwork_id' })
  artwork: Artwork;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;
}
