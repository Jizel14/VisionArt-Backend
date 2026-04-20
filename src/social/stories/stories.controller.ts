import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreateStoryDto } from './dto/story.dto';
import { StoriesService } from './stories.service';

@ApiTags('Social - Stories')
@Controller('social/stories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  @Get('feed')
  @ApiOperation({ summary: 'Get my stories feed (me + followed users)' })
  @ApiResponse({ status: 200 })
  async getFeed(
    @CurrentUser() userId: string,
    @Query('limit') limit: number = 50,
  ) {
    const safeLimit = Math.min(
      Math.max(parseInt(limit.toString(), 10) || 50, 1),
      200,
    );
    return this.storiesService.getFeed(userId, safeLimit);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new story (image URL MVP)' })
  @ApiResponse({ status: 201 })
  async createStory(
    @CurrentUser() userId: string,
    @Body() dto: CreateStoryDto,
  ) {
    return this.storiesService.create(userId, dto);
  }
}
