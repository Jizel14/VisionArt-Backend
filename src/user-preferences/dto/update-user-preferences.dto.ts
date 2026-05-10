import { PartialType } from '@nestjs/swagger';
import { CreateUserPreferencesDto } from './create-user-preferences.dto';

/**
 * Update DTO for UserPreferences
 * All fields are optional for partial updates
 * Used for PATCH /user-preferences/me
 */
export class UpdateUserPreferencesDto extends PartialType(
  CreateUserPreferencesDto,
) {}
