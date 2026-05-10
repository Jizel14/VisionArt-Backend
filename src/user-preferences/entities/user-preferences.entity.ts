import { User } from 'src/users/user.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================
  // Relationship
  // ============================================================
  /** Foreign key to users table - CASCADE DELETE on user deletion */
  @Column()
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // ============================================================
  // Artistic Style Preferences
  // ============================================================
  /** JSON array of preferred art styles (e.g., ["abstract", "impressionist"]) */
  @Column({ type: 'json', nullable: true })
  favoriteStyles: string[];

  /** JSON array of preferred color palettes (e.g., ["warm", "pastel"]) */
  @Column({ type: 'json', nullable: true })
  favoriteColors: string[];

  /** Default mood preference for art generation */
  @Column({ type: 'varchar', length: 50, nullable: true })
  preferredMood: string | null;

  /** Level of detail preference: minimal, moderate, detailed */
  @Column({
    type: 'enum',
    enum: ['minimal', 'moderate', 'detailed'],
    default: 'moderate',
  })
  artComplexity: 'minimal' | 'moderate' | 'detailed';

  // ============================================================
  // Context Preferences (GDPR-sensitive - all opt-in)
  // ============================================================
  /** GDPR: Consent to use GPS location data */
  @Column({ type: 'boolean', default: false })
  enableLocationContext: boolean;

  /** GDPR: Consent to use weather data */
  @Column({ type: 'boolean', default: false })
  enableWeatherContext: boolean;

  /** GDPR: Consent to use calendar/events data */
  @Column({ type: 'boolean', default: false })
  enableCalendarContext: boolean;

  /** GDPR: Consent to use music/listening data */
  @Column({ type: 'boolean', default: false })
  enableMusicContext: boolean;

  /** Consent to use time-of-day context (non-sensitive, opt by default) */
  @Column({ type: 'boolean', default: true })
  enableTimeContext: boolean;

  /** GDPR: Location precision level: city, district, precise */
  @Column({
    type: 'enum',
    enum: ['city', 'district', 'precise'],
    default: 'city',
  })
  locationPrecision: 'city' | 'district' | 'precise';

  // ============================================================
  // Generation Preferences
  // ============================================================
  /** Default output resolution (e.g., "1024x1024", "1920x1080") */
  @Column({ type: 'varchar', length: 50, default: '1024x1024' })
  defaultResolution: string;

  /** Default aspect ratio: square, portrait, landscape */
  @Column({ type: 'varchar', length: 50, default: 'square' })
  defaultAspectRatio: string;

  /** Content safety filter for NSFW content */
  @Column({ type: 'boolean', default: true })
  enableNSFWFilter: boolean;

  /** Quality vs speed tradeoff: fast, balanced, quality */
  @Column({
    type: 'enum',
    enum: ['fast', 'balanced', 'quality'],
    default: 'balanced',
  })
  generationQuality: 'fast' | 'balanced' | 'quality';

  // ============================================================
  // UI/UX Preferences
  // ============================================================
  /** Interface language: fr (French), en (English), ar (Arabic) */
  @Column({
    type: 'enum',
    enum: ['fr', 'en', 'ar'],
    default: 'fr',
  })
  preferredLanguage: 'fr' | 'en' | 'ar';

  /** App theme: light, dark, auto */
  @Column({
    type: 'enum',
    enum: ['light', 'dark', 'auto'],
    default: 'auto',
  })
  theme: 'light' | 'dark' | 'auto';

  /** Push notification consent */
  @Column({ type: 'boolean', default: true })
  notificationsEnabled: boolean;

  /** Email notification consent */
  @Column({ type: 'boolean', default: false })
  emailNotificationsEnabled: boolean;

  // ============================================================
  // Privacy & Data Retention (GDPR requirements)
  // ============================================================
  /** Days to keep generated images (null = indefinite) */
  @Column({ type: 'int', nullable: true, default: 365 })
  dataRetentionPeriod: number | null;

  /** GDPR: Consent for style learning and AI model training */
  @Column({ type: 'boolean', default: true })
  allowDataForTraining: boolean;

  /** Default visibility of new generations (false = private) */
  @Column({ type: 'boolean', default: false })
  shareGenerationsPublicly: boolean;

  // ============================================================
  // Timestamps & Audit Trail
  // ============================================================
  /** Auto-set on creation */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /** Auto-updated on any change */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /** Last time style preferences were modified (for learning tracking) */
  @Column({ type: 'timestamp', nullable: true, name: 'last_style_update' })
  lastStyleUpdate: Date | null;

  // ============================================================
  // Future ML Integration (extensible)
  // ============================================================
  /** JSON object for learned style vector (for future ML models) */
  @Column({ type: 'json', nullable: true })
  learnedStyleVector: Record<string, number> | null;

  /** Feedback history for style learning (for future use) */
  @Column({ type: 'json', nullable: true })
  styleFeedbackHistory: Record<string, unknown> | null;
}
