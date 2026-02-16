import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({ enum: ['artwork', 'bug', 'user', 'other'] })
  @IsString()
  @IsIn(['artwork', 'bug', 'user', 'other'])
  type: string;

  @ApiPropertyOptional({ description: 'ID of the reported artwork or user (required for artwork/user type)' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  subject: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({ description: 'Image URL (screenshot for bug reports)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}
