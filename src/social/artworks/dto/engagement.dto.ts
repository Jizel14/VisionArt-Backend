import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';

// Like DTOs
export class LikeResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  likesCount: number;
}

export class LikeUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  avatarUrl: string | null;
}

export class ArtworkLikeDto {
  @ApiProperty()
  user: LikeUserDto;

  @ApiProperty()
  likedAt: Date;
}

export class GetLikesDto {
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

export class LikesListResponseDto {
  @ApiProperty({ type: [ArtworkLikeDto] })
  data: ArtworkLikeDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Comment DTOs
export class CreateCommentDto {
  @ApiProperty({ example: 'This is amazing!' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content: string;

  @ApiPropertyOptional({ example: 'parent-comment-uuid' })
  @IsOptional()
  @IsString()
  parentCommentId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['2fd7f5d7-13fb-430a-87e4-bf9c9dfed8f6'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  mentionedUserIds?: string[];
}

export class UpdateCommentDto {
  @ApiProperty({ example: 'Updated comment text' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content: string;
}

export class CommentUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  avatarUrl: string | null;
}

export class ArtworkCommentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  user: CommentUserDto;

  @ApiProperty()
  content: string;

  @ApiProperty()
  isEdited: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ type: [Object] })
  replies?: ArtworkCommentDto[];
}

export class GetCommentsDto {
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

  @ApiPropertyOptional({ example: 'newest', enum: ['newest', 'oldest'] })
  @IsOptional()
  @IsString()
  sort?: 'newest' | 'oldest' = 'newest';
}

export class SearchMentionUsersDto {
  @ApiPropertyOptional({ example: 'ali' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  q?: string;

  @ApiPropertyOptional({ example: 8, default: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 8;
}

export class MentionUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  avatarUrl: string | null;
}

export class MentionUsersResponseDto {
  @ApiProperty({ type: [MentionUserDto] })
  data: MentionUserDto[];
}

export class CommentsListResponseDto {
  @ApiProperty({ type: [ArtworkCommentDto] })
  data: ArtworkCommentDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
