import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export enum RetentionRunStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('retention_runs')
export class RetentionRun {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true, name: 'finished_at' })
  finishedAt: Date | null;

  @Column({ type: 'int', default: 0, name: 'total_users' })
  totalUsers: number;

  @Column({ type: 'int', default: 0, name: 'total_actions' })
  totalActions: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: RetentionRunStatus.RUNNING,
  })
  status: RetentionRunStatus;

  @Column({ type: 'json', nullable: true })
  summary: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string | null;
}
