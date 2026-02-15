import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsArray,
  IsString,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateUserPreferencesDto {
  // ============================================================
  // Artistic Style Preferences (optional)
  // ============================================================
  @ApiPropertyOptional({
    description: 'Preferred art styles',
    example: ['abstract', 'impressionist'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favoriteStyles?: string[];

  @ApiPropertyOptional({
    description: 'Preferred color palettes',
    example: ['warm', 'pastel'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  favoriteColors?: string[];

  @ApiPropertyOptional({
    description: 'Default mood preference',
    example: 'calm',
    type: String,
  })
  @IsOptional()
  @IsString()
  preferredMood?: string | null;

  @ApiPropertyOptional({
    description: 'Art complexity level',
    example: 'moderate',
    enum: ['minimal', 'moderate', 'detailed'],
  })
  @IsOptional()
  @IsEnum(['minimal', 'moderate', 'detailed'])
  artComplexity?: 'minimal' | 'moderate' | 'detailed';

  // ============================================================
  // Context Preferences (GDPR-sensitive)
  // ============================================================
  @ApiPropertyOptional({
    description: 'GDPR: Consent to use location data',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  enableLocationContext?: boolean;

  @ApiPropertyOptional({
    description: 'GDPR: Consent to use weather data',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  enableWeatherContext?: boolean;

  @ApiPropertyOptional({
    description: 'GDPR: Consent to use calendar data',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  enableCalendarContext?: boolean;

  @ApiPropertyOptional({
    description: 'GDPR: Consent to use music data',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  enableMusicContext?: boolean;

  @ApiPropertyOptional({
    description: 'Use time-of-day context (non-sensitive)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enableTimeContext?: boolean;

  @ApiPropertyOptional({
    description: 'GDPR: Location precision level',
    example: 'city',
    enum: ['city', 'district', 'precise'],
  })
  @IsOptional()
  @IsEnum(['city', 'district', 'precise'])
  locationPrecision?: 'city' | 'district' | 'precise';

  // ============================================================
  // Generation Preferences
  // ============================================================
  @ApiPropertyOptional({
    description: 'Default output resolution',
    example: '1024x1024',
  })
  @IsOptional()
  @IsString()
  defaultResolution?: string;

  @ApiPropertyOptional({
    description: 'Default aspect ratio',
    example: 'square',
  })
  @IsOptional()
  @IsString()
  defaultAspectRatio?: string;

  @ApiPropertyOptional({
    description: 'NSFW content filter',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enableNSFWFilter?: boolean;

  @ApiPropertyOptional({
    description: 'Generation quality level',
    example: 'balanced',
    enum: ['fast', 'balanced', 'quality'],
  })
  @IsOptional()
  @IsEnum(['fast', 'balanced', 'quality'])
  generationQuality?: 'fast' | 'balanced' | 'quality';

  // ============================================================
  // UI/UX Preferences
  // ============================================================
  @ApiPropertyOptional({
    description: 'Preferred interface language',
    example: 'fr',
    enum: ['fr', 'en', 'ar'],
  })
  @IsOptional()
  @IsEnum(['fr', 'en', 'ar'])
  preferredLanguage?: 'fr' | 'en' | 'ar';

  @ApiPropertyOptional({
    description: 'App theme preference',
    example: 'auto',
    enum: ['light', 'dark', 'auto'],
  })
  @IsOptional()
  @IsEnum(['light', 'dark', 'auto'])
  theme?: 'light' | 'dark' | 'auto';

  @ApiPropertyOptional({
    description: 'Push notifications enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Email notifications enabled',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  emailNotificationsEnabled?: boolean;

  // ============================================================
  // Privacy & Data Retention
  // ============================================================
  @ApiPropertyOptional({
    description: 'Days to keep generated images (null = indefinite)',
    example: 365,
    type: Number,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3650) // Max 10 years
  dataRetentionPeriod?: number | null;

  @ApiPropertyOptional({
    description: 'GDPR: Consent for AI training',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowDataForTraining?: boolean;

  @ApiPropertyOptional({
    description: 'Share new generations publicly by default',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  shareGenerationsPublicly?: boolean;
}
