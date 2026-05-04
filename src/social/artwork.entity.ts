import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('artworks')
export class Artwork {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /// The generation prompt used
  @Column({ type: 'text' })
  prompt: string;

  /// Style name used for generation
  @Column({ type: 'varchar', length: 100, nullable: true })
  style: string | null;

  /// Aspect ratio used
  @Column({ name: 'aspect_ratio', type: 'varchar', length: 20, nullable: true })
  aspectRatio: string | null;

  /// Base64-encoded image data (stored server-side)
  @Column({ name: 'image_data', type: 'longtext' })
  imageData: string;

  /// MIME type (e.g. image/jpeg)
  @Column({ name: 'mime_type', type: 'varchar', length: 50, default: 'image/jpeg' })
  mimeType: string;

  /// Optional video URL if this artwork has been animated
  @Column({ name: 'video_url', type: 'text', nullable: true })
  videoUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
