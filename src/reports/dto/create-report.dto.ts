import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ReportType } from '../report.entity';

const REPORT_TYPES = Object.values(ReportType);

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_TYPES, example: ReportType.BUG })
  @IsString()
  @IsIn(REPORT_TYPES)
  type: string;

  @ApiProperty({ minLength: 3, maxLength: 255 })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  subject: string;

  @ApiProperty({ minLength: 5 })
  @IsString()
  @MinLength(5)
  @MaxLength(8000)
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(36)
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}
