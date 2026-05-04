import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('user-preferences')
@Controller('user-preferences')
export class UserPreferencesController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user preferences (legacy route)' })
  async getMyPreferences(@CurrentUser() userId: string) {
    // Return empty but valid object if not found
    return {
      favoriteStyles: [],
      favoriteColors: [],
      enableLocationContext: false,
      enableWeatherContext: false,
      enableCalendarContext: false,
      enableMusicContext: false,
      enableTimeContext: true,
      onboardingComplete: false,
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my preferences (legacy route)' })
  async updateMyPreferences(@CurrentUser() userId: string, @Body() dto: any) {
    return { ...dto, id: userId };
  }

  @Get('defaults')
  @ApiOperation({ summary: 'Get default preferences' })
  async getDefaults() {
    return {
      favoriteStyles: [],
      favoriteColors: [],
      enableLocationContext: false,
      enableWeatherContext: false,
      enableCalendarContext: false,
      enableMusicContext: false,
      enableTimeContext: true,
      onboardingComplete: false,
    };
  }

  @Get('me/context-permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getContextPermissions() {
    return {
      location: false,
      weather: false,
      music: false,
      calendar: false,
      timeOfDay: true,
      gallery: false,
    };
  }

  @Get('me/generation-context')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getGenerationContext() {
    return {
      mood: 'Calme',
      complexity: 3,
      context: {},
    };
  }
}
