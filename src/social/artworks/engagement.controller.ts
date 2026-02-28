import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { LikeService } from './like.service';
import { CommentService } from './comment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  LikeResponseDto,
  LikesListResponseDto,
  CreateCommentDto,
  UpdateCommentDto,
  ArtworkCommentDto,
  CommentsListResponseDto,
  GetLikesDto,
  GetCommentsDto,
  SearchMentionUsersDto,
  MentionUsersResponseDto,
} from './dto/engagement.dto';

@ApiTags('Social - Engagement (Likes & Comments)')
@Controller('social/artworks')
export class EngagementController {
  constructor(
    private likeService: LikeService,
    private commentService: CommentService,
  ) {}

  // =============== LIKES ===============

  @Post(':artworkId/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Like an artwork' })
  @ApiResponse({ status: 200, type: LikeResponseDto })
  async likeArtwork(
    @CurrentUser() userId: string,
    @Param('artworkId') artworkId: string,
  ) {
    return this.likeService.likeArtwork(userId, artworkId);
  }

  @Delete(':artworkId/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Unlike an artwork' })
  @ApiResponse({ status: 200, type: LikeResponseDto })
  async unlikeArtwork(
    @CurrentUser() userId: string,
    @Param('artworkId') artworkId: string,
  ) {
    return this.likeService.unlikeArtwork(userId, artworkId);
  }

  @Get(':artworkId/likes')
  @ApiOperation({ summary: 'Get likes on an artwork' })
  @ApiResponse({ status: 200, type: LikesListResponseDto })
  async getArtworkLikes(
    @Param('artworkId') artworkId: string,
    @Query() query: GetLikesDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);

    return this.likeService.getArtworkLikes(artworkId, page, limit);
  }

  // =============== COMMENTS ===============

  @Post(':artworkId/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a comment on an artwork' })
  @ApiResponse({ status: 201, type: ArtworkCommentDto })
  async createComment(
    @CurrentUser() userId: string,
    @Param('artworkId') artworkId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentService.create(userId, artworkId, dto);
  }

  @Get(':artworkId/comments')
  @ApiOperation({ summary: 'Get comments on an artwork' })
  @ApiResponse({ status: 200, type: CommentsListResponseDto })
  async getArtworkComments(
    @Param('artworkId') artworkId: string,
    @Query() query: GetCommentsDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const sort = query.sort || 'newest';

    return this.commentService.findByArtwork(artworkId, page, limit, sort);
  }

  @Get('mentions/users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users to mention in a comment' })
  @ApiResponse({ status: 200, type: MentionUsersResponseDto })
  async searchMentionUsers(@Query() query: SearchMentionUsersDto) {
    const keyword = query.q?.trim() || '';
    const limit = Math.min(query.limit || 8, 20);
    return this.commentService.searchMentionUsers(keyword, limit);
  }

  @Patch(':artworkId/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a comment (owner only)' })
  @ApiResponse({ status: 200, type: ArtworkCommentDto })
  async updateComment(
    @CurrentUser() userId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentService.update(commentId, userId, dto);
  }

  @Delete(':artworkId/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a comment (owner only)' })
  async deleteComment(
    @CurrentUser() userId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.commentService.delete(commentId, userId);
  }
}
