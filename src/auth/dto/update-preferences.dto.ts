import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

class PermissionsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() location?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() weather?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() music?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() calendar?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() timeOfDay?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() gallery?: boolean;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ type: [String], example: ['Nature & Paysages', 'Portraits & Personnages'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjects?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Impressionnisme', 'Cyberpunk'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styles?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Chaudes', 'Pastel'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colors?: string[];

  @ApiPropertyOptional({ example: 'Calme' })
  @IsOptional()
  @IsString()
  mood?: string;

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  complexity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  permissions?: PermissionsDto;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  onboardingComplete?: boolean;
}
