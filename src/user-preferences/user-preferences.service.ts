import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferences } from './entities/user-preferences.entity';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

@Injectable()
export class UserPreferencesService {
  constructor(
    @InjectRepository(UserPreferences)
    private readonly preferencesRepository: Repository<UserPreferences>,
  ) {}

  /**
   * Get default preferences object
   * Used for initialization and resetting
   * All GDPR-sensitive fields default to FALSE (opt-in)
   */
  getDefaults(): Partial<UserPreferences> {
    return {
      // Artistic
      favoriteStyles: [],
      favoriteColors: [],
      preferredMood: null,
      artComplexity: 'moderate',

      // Context (all opt-in for GDPR compliance)
      enableLocationContext: false,
      enableWeatherContext: false,
      enableCalendarContext: false,
      enableMusicContext: false,
      enableTimeContext: true, // Non-sensitive time data
      locationPrecision: 'city', // Minimal precision for privacy

      // Generation
      defaultResolution: '1024x1024',
      defaultAspectRatio: 'square',
      enableNSFWFilter: true,
      generationQuality: 'balanced',

      // UI/UX
      preferredLanguage: 'fr', // Tunisia default
      theme: 'auto',
      notificationsEnabled: true,
      emailNotificationsEnabled: false,

      // Privacy
      dataRetentionPeriod: 365, // 1 year
      allowDataForTraining: true,
      shareGenerationsPublicly: false,

      // ML Integration
      learnedStyleVector: null,
      styleFeedbackHistory: null,
    };
  }

  /**
   * Find preferences by user ID
   * Auto-creates default preferences if not found
   * Ensures every user always has preferences
   */
  async findByUserId(userId: string): Promise<UserPreferences> {
    let preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      // Auto-create default preferences
      preferences = await this.createDefault(userId);
    }

    return preferences;
  }

  /**
   * Create default preferences for a new user
   * Called during user registration
   */
  async createDefault(userId: string): Promise<UserPreferences> {
    const defaults = this.getDefaults();

    const preferences = this.preferencesRepository.create({
      userId,
      ...defaults,
    });

    return this.preferencesRepository.save(preferences);
  }

  /**
   * Update preferences (full or partial)
   * Updates lastStyleUpdate if style-related fields change
   * Validates all provided data
   */
  async update(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferences> {
    let preferences = await this.findByUserId(userId);

    // Check if any style-related fields are being updated
    const styleFieldsToCheck = [
      'favoriteStyles',
      'favoriteColors',
      'preferredMood',
      'artComplexity',
    ];
    const isStyleUpdate = styleFieldsToCheck.some(
      (field) => field in dto && dto[field] !== undefined,
    );

    // Update all provided fields
    Object.assign(preferences, dto);

    // Update style modification timestamp if styles changed
    if (isStyleUpdate) {
      preferences.lastStyleUpdate = new Date();
    }

    preferences = await this.preferencesRepository.save(preferences);

    return preferences;
  }

  /**
   * Reset preferences to defaults
   * Useful for users who want to start fresh
   */
  async reset(userId: string): Promise<UserPreferences> {
    const preferences = await this.findByUserId(userId);

    const defaults = this.getDefaults();
    Object.assign(preferences, defaults);
    preferences.lastStyleUpdate = new Date();

    return this.preferencesRepository.save(preferences);
  }

  /**
   * Check if user has granted permission for specific context
   * Used by generation service to decide whether to include context data
   */
  async hasContextPermission(
    userId: string,
    contextType: string,
  ): Promise<boolean> {
    const preferences = await this.findByUserId(userId);

    const contextMap: Record<string, boolean> = {
      location: preferences.enableLocationContext,
      weather: preferences.enableWeatherContext,
      calendar: preferences.enableCalendarContext,
      music: preferences.enableMusicContext,
      time: preferences.enableTimeContext,
    };

    return contextMap[contextType] ?? false;
  }

  /**
   * Get all context permissions for a user
   * Useful for checking consent status across all contexts
   */
  async getAllContextPermissions(
    userId: string,
  ): Promise<Record<string, boolean>> {
    const preferences = await this.findByUserId(userId);

    return {
      location: preferences.enableLocationContext,
      weather: preferences.enableWeatherContext,
      calendar: preferences.enableCalendarContext,
      music: preferences.enableMusicContext,
      time: preferences.enableTimeContext,
    };
  }

  /**
   * Update style modification timestamp
   * Called when user provides feedback on generated styles
   */
  async updateStyleTimestamp(userId: string): Promise<void> {
    await this.preferencesRepository.update(
      { userId },
      { lastStyleUpdate: new Date() },
    );
  }

  /**
   * Get user preferences for AI prompt generation
   * Returns only fields relevant to generation
   */
  async getGenerationContext(userId: string): Promise<{
    preferredMood: string | null;
    artComplexity: string;
    favoriteStyles: string[];
    favoriteColors: string[];
    contextData: Record<string, unknown>;
  }> {
    const preferences = await this.findByUserId(userId);

    // Build context data based on user's consent
    const contextData: Record<string, unknown> = {};

    if (preferences.enableLocationContext) {
      contextData.locationPrecision = preferences.locationPrecision;
    }
    if (preferences.enableWeatherContext) {
      contextData.weather = true;
    }
    if (preferences.enableCalendarContext) {
      contextData.calendar = true;
    }
    if (preferences.enableMusicContext) {
      contextData.music = true;
    }
    if (preferences.enableTimeContext) {
      contextData.timeOfDay = true;
    }

    return {
      preferredMood: preferences.preferredMood,
      artComplexity: preferences.artComplexity,
      favoriteStyles: preferences.favoriteStyles,
      favoriteColors: preferences.favoriteColors,
      contextData,
    };
  }

  /**
   * Update learned style vector (for ML model integration)
   * Called after model training on user's style feedback
   */
  async updateLearnedStyleVector(
    userId: string,
    vector: Record<string, number>,
  ): Promise<UserPreferences> {
    const preferences = await this.findByUserId(userId);

    preferences.learnedStyleVector = vector;
    preferences.lastStyleUpdate = new Date();

    return this.preferencesRepository.save(preferences);
  }

  /**
   * Add feedback to style history
   * Accumulates feedback for ML model training
   */
  async addStyleFeedback(
    userId: string,
    feedback: Record<string, unknown>,
  ): Promise<UserPreferences> {
    const preferences = await this.findByUserId(userId);

    if (!preferences.styleFeedbackHistory) {
      preferences.styleFeedbackHistory = {};
    }

    // Store feedback with timestamp
    const timestamp = new Date().toISOString();
    preferences.styleFeedbackHistory[timestamp] = feedback;

    preferences.lastStyleUpdate = new Date();

    return this.preferencesRepository.save(preferences);
  }

  /**
   * Check if user consents to data retention
   * Returns amount of days to retain data (null = indefinite)
   */
  getDataRetentionDays(preferences: UserPreferences): number | null {
    return preferences.dataRetentionPeriod;
  }

  /**
   * Check if user allows their data for training
   */
  allowsDataForTraining(preferences: UserPreferences): boolean {
    return preferences.allowDataForTraining;
  }

  /**
   * Check if user shares generations publicly by default
   */
  sharesPubliclyByDefault(preferences: UserPreferences): boolean {
    return preferences.shareGenerationsPublicly;
  }
}
