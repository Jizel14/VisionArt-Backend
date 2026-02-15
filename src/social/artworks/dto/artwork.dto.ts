import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  MaxLength,
  IsBoolean,
  IsObject,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsEnum,
  MinLength,
} from 'class-validator';

export class CreateArtworkDto {
  @ApiPropertyOptional({ example: 'Sunset Dreams' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'A beautiful sunset generated with AI' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 'https://cdn.example.com/image.jpg' })
  @IsUrl()
  imageUrl: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/thumb.jpg' })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  prompt?: object;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean = false;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isNSFW?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: object;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  contextData?: object;

  @ApiPropertyOptional({ example: 'original-artwork-uuid' })
  @IsOptional()
  @IsUUID()
  remixedFromId?: string;
}

export class UpdateArtworkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class ArtworkUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  avatarUrl: string | null;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  isVerified: boolean;
}

export class ArtworkRemixDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user: {
    name: string;
  };
}

export class ArtworkResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user: ArtworkUserDto;

  @ApiPropertyOptional()
  title: string | null;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  imageUrl: string;

  @ApiPropertyOptional()
  thumbnailUrl: string | null;

  @ApiProperty()
  likesCount: number;

  @ApiProperty()
  commentsCount: number;

  @ApiProperty()
  remixCount: number;

  @ApiProperty()
  isLikedByMe: boolean;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty()
  isNSFW: boolean;

  @ApiPropertyOptional()
  remixedFrom: ArtworkRemixDto | null;

  @ApiProperty()
  createdAt: Date;
}

export class GetArtworksDto {
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

  @ApiPropertyOptional({
    example: 'recent',
    enum: ['recent', 'popular', 'trending'],
  })
  @IsOptional()
  @IsString()
  sort?: 'recent' | 'popular' | 'trending' = 'recent';
}

export class ExploreArtworksDto {
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

  @ApiPropertyOptional({
    example: 'trending',
    enum: ['trending', 'popular', 'recent', 'featured'],
  })
  @IsOptional()
  @IsString()
  filter?: 'trending' | 'popular' | 'recent' | 'featured' = 'trending';
}

export class ArtworkListResponseDto {
  @ApiProperty({ type: [ArtworkResponseDto] })
  data: ArtworkResponseDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class RemixRequestResponseDto {
  @ApiProperty()
  originalArtwork: {
    id: string;
    prompt: object | null;
    imageUrl: string;
  };

  @ApiProperty()
  remixToken: string;

  @ApiProperty()
  expiresAt: Date;
}
