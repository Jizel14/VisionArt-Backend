import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type ReportType = 'artwork' | 'bug' | 'user' | 'other';
export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The user who submitted the report */
  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Type of report: artwork, bug, user, other */
  @Column({ type: 'varchar', length: 20 })
  type: ReportType;

  /** Target entity id (artwork id, reported user id, etc.) – nullable for bug/other */
  @Column({ name: 'target_id', type: 'varchar', length: 36, nullable: true })
  targetId: string | null;

  /** Short subject / title */
  @Column({ type: 'varchar', length: 255 })
  subject: string;

  /** Detailed description */
  @Column({ type: 'text' })
  description: string;

  /** Optional image URL (e.g. screenshot for bug reports) */
  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  /** Status of the report */
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ReportStatus;

  /** Admin note (set from backoffice) */
  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
