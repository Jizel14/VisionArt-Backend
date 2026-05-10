import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class SaveArtworkDto {
  @ApiPropertyOptional({ example: 'Favorites' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  collectionName?: string;
}

export class GetSavedArtworksDto {
  @ApiPropertyOptional({ example: 'Favorites' })
  @IsOptional()
  @IsString()
  collectionName?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class CollectionSummaryDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  itemsCount: number;
}
