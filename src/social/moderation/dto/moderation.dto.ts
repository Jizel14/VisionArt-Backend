import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ReportReason, ReportStatus } from '../entities/artwork-report.entity';

export class CreateReportDto {
  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({ example: 'Detailed explanation of the report' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ReportResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  reportId: string;

  @ApiPropertyOptional()
  message?: string;
}

export class ArtworkReportDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  artworkId: string;

  @ApiProperty()
  reporter: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty({ enum: ReportReason })
  reason: ReportReason;

  @ApiPropertyOptional()
  details: string | null;

  @ApiProperty({ enum: ReportStatus })
  status: ReportStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  artwork: {
    id: string;
    title: string | null;
    imageUrl: string;
    user: {
      name: string;
      email: string;
    };
  };
}
