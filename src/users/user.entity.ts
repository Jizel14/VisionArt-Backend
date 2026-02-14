import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface UserPreferencesPermissions {
  location?: boolean;
  weather?: boolean;
  music?: boolean;
  calendar?: boolean;
  timeOfDay?: boolean;
  gallery?: boolean;
}

export interface UserPreferencesData {
  subjects?: string[];
  styles?: string[];
  colors?: string[];
  mood?: string;
  complexity?: number;
  permissions?: UserPreferencesPermissions;
  onboardingComplete?: boolean;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'provider', type: 'varchar', length: 20, default: 'local' })
  provider: string;

  @Column({ name: 'google_id', type: 'varchar', length: 255, nullable: true, unique: true })
  googleId: string | null;

  @Column({ type: 'json', nullable: true })
  preferences: UserPreferencesData | null;

  @Column({ name: 'reset_password_token', type: 'varchar', length: 255, nullable: true })
  resetPasswordToken: string | null;

  @Column({ name: 'reset_password_expires', type: 'datetime', nullable: true })
  resetPasswordExpires: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
