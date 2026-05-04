import { Controller, Get, Post, Delete, Query, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('follow')
@Controller('social/follow')
export class FollowController {
  @Post(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async followUser(@Param('userId') userId: string) {
    return { followed: true, userId };
  }

  @Delete(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async unfollowUser(@Param('userId') userId: string) {
    return { followed: false, userId };
  }

  @Get('status/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getFollowStatus(@Param('userId') userId: string) {
    return { isFollowing: false, isFollowedBy: false };
  }

  @Get('followers/list')
  async getFollowers(
    @Query('userId') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return {
      data: [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: 0,
        totalPages: 0,
      },
    };
  }

  @Get('following/list')
  async getFollowing(
    @Query('userId') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return {
      data: [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: 0,
        totalPages: 0,
      },
    };
  }

  @Get('suggestions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getSuggestions(@Query('limit') limit = 50) {
    return { suggestions: [] };
  }
}
