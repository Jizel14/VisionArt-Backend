import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

/**
 * Response DTO for UserPreferences
 * Excludes internal/sensitive fields from API responses
 * Used for GET /user-preferences/me
 */
export class UserPreferencesResponseDto {
  @ApiProperty({
    description: 'Unique identifier for preferences',
    example: 'uuid-here',
  })
  id: string;

  // ============================================================
  // Artistic Style Preferences
  // ============================================================
  @ApiProperty({
    description: 'Preferred art styles',
    example: ['abstract', 'impressionist'],
    type: [String],
  })
  favoriteStyles: string[];

  @ApiProperty({
    description: 'Preferred color palettes',
    example: ['warm', 'pastel'],
    type: [String],
  })
  favoriteColors: string[];

  @ApiProperty({
    description: 'Default mood preference',
    example: 'calm',
    nullable: true,
  })
  preferredMood: string | null;

  @ApiProperty({
    description: 'Art complexity level',
    example: 'moderate',
    enum: ['minimal', 'moderate', 'detailed'],
  })
  artComplexity: 'minimal' | 'moderate' | 'detailed';

  // ============================================================
  // Context Preferences
  // ============================================================
  @ApiProperty({
    description: 'Location context enabled',
    example: false,
  })
  enableLocationContext: boolean;

  @ApiProperty({
    description: 'Weather context enabled',
    example: false,
  })
  enableWeatherContext: boolean;

  @ApiProperty({
    description: 'Calendar context enabled',
    example: false,
  })
  enableCalendarContext: boolean;

  @ApiProperty({
    description: 'Music context enabled',
    example: false,
  })
  enableMusicContext: boolean;

  @ApiProperty({
    description: 'Time context enabled',
    example: true,
  })
  enableTimeContext: boolean;

  @ApiProperty({
    description: 'Location precision level',
    example: 'city',
    enum: ['city', 'district', 'precise'],
  })
  locationPrecision: 'city' | 'district' | 'precise';

  // ============================================================
  // Generation Preferences
  // ============================================================
  @ApiProperty({
    description: 'Default output resolution',
    example: '1024x1024',
  })
  defaultResolution: string;

  @ApiProperty({
    description: 'Default aspect ratio',
    example: 'square',
  })
  defaultAspectRatio: string;

  @ApiProperty({
    description: 'NSFW filter enabled',
    example: true,
  })
  enableNSFWFilter: boolean;

  @ApiProperty({
    description: 'Generation quality level',
    example: 'balanced',
    enum: ['fast', 'balanced', 'quality'],
  })
  generationQuality: 'fast' | 'balanced' | 'quality';

  // ============================================================
  // UI/UX Preferences
  // ============================================================
  @ApiProperty({
    description: 'Preferred interface language',
    example: 'fr',
    enum: ['fr', 'en', 'ar'],
  })
  preferredLanguage: 'fr' | 'en' | 'ar';

  @ApiProperty({
    description: 'App theme preference',
    example: 'auto',
    enum: ['light', 'dark', 'auto'],
  })
  theme: 'light' | 'dark' | 'auto';

  @ApiProperty({
    description: 'Push notifications enabled',
    example: true,
  })
  notificationsEnabled: boolean;

  @ApiProperty({
    description: 'Email notifications enabled',
    example: false,
  })
  emailNotificationsEnabled: boolean;

  // ============================================================
  // Privacy & Data Retention
  // ============================================================
  @ApiProperty({
    description: 'Data retention period in days',
    example: 365,
    nullable: true,
  })
  dataRetentionPeriod: number | null;

  @ApiProperty({
    description: 'AI training data consent',
    example: true,
  })
  allowDataForTraining: boolean;

  @ApiProperty({
    description: 'Public visibility by default',
    example: false,
  })
  shareGenerationsPublicly: boolean;

  // ============================================================
  // Timestamps
  // ============================================================
  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-02-14T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-02-14T10:00:00Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Last style preferences modification',
    example: '2025-02-14T10:00:00Z',
    nullable: true,
  })
  lastStyleUpdate: Date | null;

  // ============================================================
  // Internal Fields (excluded from response)
  // ============================================================
  @Exclude()
  userId: string;

  @Exclude()
  learnedStyleVector: Record<string, number> | null;

  @Exclude()
  styleFeedbackHistory: Record<string, unknown> | null;
}
