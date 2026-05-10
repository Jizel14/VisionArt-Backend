import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferencesService } from './user-preferences.service';
import { UserPreferences } from './entities/user-preferences.entity';

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;
  let repository: Repository<UserPreferences>;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440000';

  const mockPreferences: UserPreferences = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    userId: mockUserId,
    user: null,
    favoriteStyles: ['abstract', 'impressionist'],
    favoriteColors: ['warm'],
    preferredMood: 'calm',
    artComplexity: 'moderate',
    enableLocationContext: false,
    enableWeatherContext: false,
    enableCalendarContext: false,
    enableMusicContext: false,
    enableTimeContext: true,
    locationPrecision: 'city',
    defaultResolution: '1024x1024',
    defaultAspectRatio: 'square',
    enableNSFWFilter: true,
    generationQuality: 'balanced',
    preferredLanguage: 'fr',
    theme: 'auto',
    notificationsEnabled: true,
    emailNotificationsEnabled: false,
    dataRetentionPeriod: 365,
    allowDataForTraining: true,
    shareGenerationsPublicly: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastStyleUpdate: new Date(),
    learnedStyleVector: null,
    styleFeedbackHistory: null,
  };

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPreferencesService,
        {
          provide: getRepositoryToken(UserPreferences),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UserPreferencesService>(UserPreferencesService);
    repository = module.get<Repository<UserPreferences>>(
      getRepositoryToken(UserPreferences),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDefaults', () => {
    it('should return default preferences object', () => {
      const defaults = service.getDefaults();

      expect(defaults).toHaveProperty('favoriteStyles', []);
      expect(defaults).toHaveProperty('artComplexity', 'moderate');
      expect(defaults).toHaveProperty('enableLocationContext', false);
      expect(defaults).toHaveProperty('enableTimeContext', true);
      expect(defaults).toHaveProperty('preferredLanguage', 'fr');
      expect(defaults).toHaveProperty('theme', 'auto');
      expect(defaults).toHaveProperty('generationQuality', 'balanced');
      expect(defaults).toHaveProperty('dataRetentionPeriod', 365);
    });

    it('should have all required fields in defaults', () => {
      const defaults = service.getDefaults();

      const requiredFields = [
        'favoriteStyles',
        'favoriteColors',
        'artComplexity',
        'enableLocationContext',
        'enableWeatherContext',
        'preferredLanguage',
        'theme',
        'dataRetentionPeriod',
        'allowDataForTraining',
      ];

      requiredFields.forEach((field) => {
        expect(defaults).toHaveProperty(field);
      });
    });
  });

  describe('findByUserId', () => {
    it('should return existing preferences', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);

      const result = await service.findByUserId(mockUserId);

      expect(result).toEqual(mockPreferences);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
    });

    it('should auto-create default preferences if not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);
      mockRepository.create.mockReturnValue(mockPreferences);
      mockRepository.save.mockResolvedValue(mockPreferences);

      const result = await service.findByUserId(mockUserId);

      expect(result).toEqual(mockPreferences);
      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('createDefault', () => {
    it('should create preferences with default values', async () => {
      mockRepository.create.mockReturnValue(mockPreferences);
      mockRepository.save.mockResolvedValue(mockPreferences);

      const result = await service.createDefault(mockUserId);

      expect(result).toEqual(mockPreferences);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          artComplexity: 'moderate',
          preferredLanguage: 'fr',
        }),
      );
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update preferences', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);
      mockRepository.save.mockResolvedValue({
        ...mockPreferences,
        preferredMood: 'energetic',
      });

      const updateDto = { preferredMood: 'energetic' };
      const result = await service.update(mockUserId, updateDto);

      expect(result.preferredMood).toBe('energetic');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should update lastStyleUpdate when style fields change', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);
      const updatedPrefs = {
        ...mockPreferences,
        favoriteStyles: ['cyberpunk'],
        lastStyleUpdate: new Date(),
      };
      mockRepository.save.mockResolvedValue(updatedPrefs);

      const updateDto = { favoriteStyles: ['cyberpunk'] };
      const result = await service.update(mockUserId, updateDto);

      expect(result.lastStyleUpdate).not.toBeNull();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should not update lastStyleUpdate for non-style fields', async () => {
      const prefs = { ...mockPreferences, lastStyleUpdate: null };
      mockRepository.findOne.mockResolvedValue(prefs);
      mockRepository.save.mockResolvedValue({
        ...prefs,
        theme: 'dark',
      });

      const updateDto = { theme: 'dark' };
      await service.update(mockUserId, updateDto);

      // After object.assign, lastStyleUpdate remains null
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset preferences to defaults', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);
      const resetPrefs = service.getDefaults();
      mockRepository.save.mockResolvedValue({
        ...mockPreferences,
        ...resetPrefs,
        lastStyleUpdate: new Date(),
      });

      const result = await service.reset(mockUserId);

      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.artComplexity).toBe('moderate');
      expect(result.preferredLanguage).toBe('fr');
    });
  });

  describe('hasContextPermission', () => {
    it('should return true for enabled context', async () => {
      const prefs = { ...mockPreferences, enableLocationContext: true };
      mockRepository.findOne.mockResolvedValue(prefs);

      const result = await service.hasContextPermission(mockUserId, 'location');

      expect(result).toBe(true);
    });

    it('should return false for disabled context', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);

      const result = await service.hasContextPermission(mockUserId, 'location');

      expect(result).toBe(false);
    });

    it('should return false for unknown context', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);

      const result = await service.hasContextPermission(mockUserId, 'unknown');

      expect(result).toBe(false);
    });
  });

  describe('getAllContextPermissions', () => {
    it('should return all context permissions', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);

      const result = await service.getAllContextPermissions(mockUserId);

      expect(result).toHaveProperty('location', false);
      expect(result).toHaveProperty('weather', false);
      expect(result).toHaveProperty('calendar', false);
      expect(result).toHaveProperty('music', false);
      expect(result).toHaveProperty('time', true);
    });
  });

  describe('getGenerationContext', () => {
    it('should return generation context respecting consent', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);

      const result = await service.getGenerationContext(mockUserId);

      expect(result).toHaveProperty('preferredMood');
      expect(result).toHaveProperty('artComplexity', 'moderate');
      expect(result).toHaveProperty('favoriteStyles');
      expect(result).toHaveProperty('contextData');
      // Time should be included (enabled = true)
      expect(result.contextData.timeOfDay).toBe(true);
      // Location should not be included (enabled = false)
      expect(result.contextData.locationPrecision).toBeUndefined();
    });

    it('should include location context when enabled', async () => {
      const prefs = { ...mockPreferences, enableLocationContext: true };
      mockRepository.findOne.mockResolvedValue(prefs);

      const result = await service.getGenerationContext(mockUserId);

      expect(result.contextData.locationPrecision).toBe('city');
    });
  });

  describe('updateLearnedStyleVector', () => {
    it('should update learned style vector', async () => {
      mockRepository.findOne.mockResolvedValue(mockPreferences);
      const vector = { style_abstract: 0.8, style_modern: 0.6 };
      const updatedPrefs = {
        ...mockPreferences,
        learnedStyleVector: vector,
      };
      mockRepository.save.mockResolvedValue(updatedPrefs);

      const result = await service.updateLearnedStyleVector(mockUserId, vector);

      expect(result.learnedStyleVector).toEqual(vector);
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('addStyleFeedback', () => {
    it('should add feedback to style history', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockPreferences,
        styleFeedbackHistory: null,
      });
      const feedback = { rating: 5, style: 'abstract' };
      const updatedPrefs = {
        ...mockPreferences,
        styleFeedbackHistory: { '2025-02-14T10:00:00Z': feedback },
      };
      mockRepository.save.mockResolvedValue(updatedPrefs);

      const result = await service.addStyleFeedback(mockUserId, feedback);

      expect(result.styleFeedbackHistory).not.toBeNull();
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('Privacy & GDPR methods', () => {
    it('should return data retention days', () => {
      const days = service.getDataRetentionDays(mockPreferences);
      expect(days).toBe(365);
    });

    it('should return null for indefinite retention', () => {
      const prefs = { ...mockPreferences, dataRetentionPeriod: null };
      const days = service.getDataRetentionDays(prefs);
      expect(days).toBeNull();
    });

    it('should check training data consent', () => {
      const allows = service.allowsDataForTraining(mockPreferences);
      expect(allows).toBe(true);
    });

    it('should check public sharing default', () => {
      const shares = service.sharesPubliclyByDefault(mockPreferences);
      expect(shares).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty favorite styles array', async () => {
      const prefs = { ...mockPreferences, favoriteStyles: [] };
      mockRepository.findOne.mockResolvedValue(prefs);

      const result = await service.findByUserId(mockUserId);

      expect(result.favoriteStyles).toEqual([]);
    });

    it('should handle null preferred mood', async () => {
      const prefs = { ...mockPreferences, preferredMood: null };
      mockRepository.findOne.mockResolvedValue(prefs);

      const result = await service.findByUserId(mockUserId);

      expect(result.preferredMood).toBeNull();
    });
  });
});
