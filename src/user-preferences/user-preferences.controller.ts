import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserPreferencesService } from './user-preferences.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import { UserPreferencesResponseDto } from './dto/user-preferences-response.dto';
import { UserPreferences } from './entities/user-preferences.entity';

@ApiTags('user-preferences')
@Controller('user-preferences')
export class UserPreferencesController {
  constructor(
    private readonly userPreferencesService: UserPreferencesService,
  ) {}

  /**
   * Get current user's preferences
   * Returns all preferences or defaults if not yet created
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user preferences',
    description:
      'Retrieve all user preferences. Creates default if not exists.',
  })
  @ApiResponse({
    status: 200,
    description: 'User preferences retrieved successfully',
    type: UserPreferencesResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid token',
  })
  async getPreferences(
    @CurrentUser() userId: string,
  ): Promise<UserPreferencesResponseDto> {
    const preferences = await this.userPreferencesService.findByUserId(userId);
    return this.mapToResponseDto(preferences);
  }

  /**
   * Update user preferences (full replacement)
   * PUT replaces all provided fields
   */
  @Put('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update all user preferences',
    description:
      'Replace user preferences with provided values. Partial updates use PATCH.',
  })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated successfully',
    type: UserPreferencesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid preference values (validation error)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async updatePreferences(
    @CurrentUser() userId: string,
    @Body() dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    const preferences = await this.userPreferencesService.update(userId, dto);
    return this.mapToResponseDto(preferences);
  }

  /**
   * Partial update of user preferences
   * PATCH updates only provided fields
   * Automatically updates lastStyleUpdate if style fields change
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Partially update user preferences',
    description:
      'Update specific preference fields. Omitted fields are not modified.',
  })
  @ApiResponse({
    status: 200,
    description: 'Preferences partially updated successfully',
    type: UserPreferencesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid preference values',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async partialUpdatePreferences(
    @CurrentUser() userId: string,
    @Body() dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    const preferences = await this.userPreferencesService.update(userId, dto);
    return this.mapToResponseDto(preferences);
  }

  /**
   * Reset preferences to default values
   * Useful for users who want to start fresh
   */
  @Post('reset')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reset preferences to defaults',
    description: 'Reset all preferences to system defaults',
  })
  @ApiResponse({
    status: 200,
    description: 'Preferences reset successfully',
    type: UserPreferencesResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async resetPreferences(
    @CurrentUser() userId: string,
  ): Promise<UserPreferencesResponseDto> {
    const preferences = await this.userPreferencesService.reset(userId);
    return this.mapToResponseDto(preferences);
  }

  /**
   * Get default preference values
   * Public endpoint - no authentication required
   * Useful for UI initialization before user logs in
   */
  @Get('defaults')
  @ApiOperation({
    summary: 'Get default preference values',
    description:
      'Public endpoint - returns default preferences for UI initialization',
  })
  @ApiResponse({
    status: 200,
    description: 'Default preferences returned',
    type: UserPreferencesResponseDto,
  })
  async getDefaults(): Promise<Partial<UserPreferences>> {
    const defaults = await this.userPreferencesService.getDefaults();
    return defaults;
  }

  /**
   * Get context permissions for generation
   * Returns subset of preferences for AI generation service
   */
  @Get('me/context-permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user context permissions',
    description:
      'Get which data contexts user has consented to (location, weather, etc)',
  })
  @ApiResponse({
    status: 200,
    description: 'Context permissions retrieved',
    schema: {
      example: {
        location: false,
        weather: false,
        calendar: false,
        music: false,
        time: true,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getContextPermissions(
    @CurrentUser() userId: string,
  ): Promise<Record<string, boolean>> {
    return this.userPreferencesService.getAllContextPermissions(userId);
  }

  /**
   * Get generation context
   * Returns user preferences formatted for AI prompt generation
   * Respects user's consent for each data type
   */
  @Get('me/generation-context')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get preferences for AI generation',
    description:
      'Get user preferences and context formatted for art generation (respects consent)',
  })
  @ApiResponse({
    status: 200,
    description: 'Generation context retrieved',
    schema: {
      example: {
        preferredMood: 'calm',
        artComplexity: 'moderate',
        favoriteStyles: ['abstract'],
        favoriteColors: ['warm'],
        contextData: { time: true },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getGenerationContext(
    @CurrentUser() userId: string,
  ): Promise<Record<string, unknown>> {
    return this.userPreferencesService.getGenerationContext(userId);
  }

  /**
   * Helper method to map UserPreferences to response DTO
   * Excludes sensitive internal fields
   */
  private mapToResponseDto(
    preferences: UserPreferences,
  ): UserPreferencesResponseDto {
    const dto = new UserPreferencesResponseDto();
    Object.assign(dto, preferences);
    return dto;
  }
}
