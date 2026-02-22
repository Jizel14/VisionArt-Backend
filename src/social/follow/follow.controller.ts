import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { FollowService } from './follow.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  FollowResponseDto,
  GetFollowersDto,
  FollowerListResponseDto,
  FollowStatusDto,
} from './dto/follow.dto';

@ApiTags('Social - Follow')
@Controller('social/follow')
export class FollowController {
  constructor(private followService: FollowService) {}

  @Post(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Follow a user' })
  @ApiResponse({ status: 200, type: FollowResponseDto })
  async followUser(
    @CurrentUser() userId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.followService.followUser(userId, targetUserId);
  }

  @Delete(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unfollow a user' })
  async unfollowUser(
    @CurrentUser() userId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.followService.unfollowUser(userId, targetUserId);
  }

  @Get('followers/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get followers of a user' })
  @ApiResponse({ status: 200, type: FollowerListResponseDto })
  async getFollowers(
    @CurrentUser() userId: string,
    @Query() query: GetFollowersDto,
  ) {
    const targetUserId = query.userId || userId;
    const page = query.page || 1;
    const limit = query.limit || 20;

    return this.followService.getFollowers(targetUserId, page, limit);
  }

  @Get('following/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get users that you are following' })
  @ApiResponse({ status: 200, type: FollowerListResponseDto })
  async getFollowing(
    @CurrentUser() userId: string,
    @Query() query: GetFollowersDto,
  ) {
    const targetUserId = query.userId || userId;
    const page = query.page || 1;
    const limit = query.limit || 20;

    return this.followService.getFollowing(targetUserId, page, limit);
  }

  @Get('status/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check follow status with a user' })
  @ApiResponse({ status: 200, type: FollowStatusDto })
  async getFollowStatus(
    @CurrentUser() userId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.followService.getFollowStatus(userId, targetUserId);
  }

  @Get('suggestions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get suggested users to follow' })
  async getSuggestions(
    @CurrentUser() userId: string,
    @Query('limit') limit: number = 10,
  ) {
    const sanitizedLimit = Math.min(parseInt(limit.toString()) || 10, 50);
    return this.followService.getSuggestions(userId, sanitizedLimit);
  }
}
