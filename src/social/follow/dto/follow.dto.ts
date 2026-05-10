import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsInt, Min, Max } from 'class-validator';

export class FollowResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  follower: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty()
  following: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty()
  followedAt: Date;
}

export class FollowerDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  follower: {
    id: string;
    name: string;
    email: string;
    bio: string | null;
    avatarUrl: string | null;
    followersCount: number;
    followingCount: number;
    isVerified: boolean;
  };

  @ApiProperty()
  followedAt: Date;

  @ApiProperty()
  isFollowingBack: boolean;
}

export class GetFollowersDto {
  @ApiPropertyOptional({ example: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

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

export class FollowStatusDto {
  @ApiProperty()
  isFollowing: boolean;

  @ApiProperty()
  isFollowedBy: boolean;

  @ApiProperty()
  isMutual: boolean;
}

export class UserSuggestionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  bio: string | null;

  @ApiPropertyOptional()
  avatarUrl: string | null;

  @ApiProperty()
  followersCount: number;

  @ApiProperty()
  publicGenerationsCount: number;

  @ApiPropertyOptional()
  mutualFollowers: number;

  @ApiProperty()
  reason: string;
}

export class PaginationDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

export class FollowerListResponseDto {
  @ApiProperty({ type: [FollowerDto] })
  data: FollowerDto[];

  @ApiProperty()
  pagination: PaginationDto;
}
