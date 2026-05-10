import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
  HttpCode,
  HttpException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ArtworkService } from './artwork.service';
import { ImageGenerationService } from '../image-generation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artwork } from './entities/artwork.entity';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AiModerationInterceptor } from '../../ai-moderation/ai-moderation.interceptor';
import { ModerationStatus } from '../../ai-moderation/ai-moderation.constants';
import {
  CreateArtworkDto,
  UpdateArtworkDto,
  ArtworkResponseDto,
  GetArtworksDto,
  ExploreArtworksDto,
  ArtworkListResponseDto,
  RemixRequestResponseDto,
} from './dto/artwork.dto';

@ApiTags('Social - Artworks')
@Controller('social/artworks')
export class ArtworksController {
  constructor(
    private artworkService: ArtworkService,
    private imageGenerationService: ImageGenerationService,
    @InjectRepository(Artwork)
    private artworkRepository: Repository<Artwork>,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(AiModerationInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new artwork' })
  @ApiResponse({ status: 201, type: ArtworkResponseDto })
  async createArtwork(
    @CurrentUser() userId: string,
    @Body() dto: CreateArtworkDto,
    @Req() req: Request,
  ) {
    const r = req as unknown as Record<string, unknown>;
    const moderationStatus = r['moderationStatus'] as
      | ModerationStatus
      | undefined;
    const moderationReason = r['moderationReason'] as string | null | undefined;
    return this.artworkService.create(
      userId,
      dto,
      moderationStatus,
      moderationReason ?? null,
    );
  }

  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get personalized feed (followed users' artworks)",
  })
  @ApiResponse({ status: 200, type: ArtworkListResponseDto })
  async getFeed(@CurrentUser() userId: string, @Query() query: GetArtworksDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const sort = query.sort || 'recent';

    return this.artworkService.getFeed(userId, page, limit, sort);
  }

  @Get('feed/public')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get public feed (all users' public artworks)",
  })
  @ApiResponse({ status: 200, type: ArtworkListResponseDto })
  async getPublicFeed(
    @CurrentUser() userId: string,
    @Query() query: GetArtworksDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const sort = query.sort || 'recent';

    return this.artworkService.getPublicFeed(userId, page, limit, sort);
  }

  @Get('explore')
  @ApiOperation({ summary: 'Explore trending/popular artworks' })
  @ApiResponse({ status: 200, type: ArtworkListResponseDto })
  async getExplore(@Query() query: ExploreArtworksDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const filter = query.filter || 'trending';

    return this.artworkService.getExplore(page, limit, filter);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get artwork by ID' })
  @ApiResponse({ status: 200, type: ArtworkResponseDto })
  async getArtwork(
    @Param('id') artworkId: string,
    @CurrentUser() userId: string,
  ) {
    return this.artworkService.findById(artworkId, userId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: "Get user's gallery (public artworks)" })
  @ApiResponse({ status: 200, type: ArtworkListResponseDto })
  async getUserGallery(
    @Param('userId') userId: string,
    @Query() query: GetArtworksDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);

    return this.artworkService.findByUserId(userId, page, limit);
  }

  @Get('me/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user's artworks (including private)" })
  @ApiResponse({ status: 200, type: ArtworkListResponseDto })
  async getMyArtworks(
    @CurrentUser() userId: string,
    @Query() query: GetArtworksDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);

    return this.artworkService.findByUserId(userId, page, limit, userId, true);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update artwork (owner only)' })
  @ApiResponse({ status: 200, type: ArtworkResponseDto })
  async updateArtwork(
    @CurrentUser() userId: string,
    @Param('id') artworkId: string,
    @Body() dto: UpdateArtworkDto,
  ) {
    return this.artworkService.update(artworkId, userId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete artwork (owner only)' })
  async deleteArtwork(
    @CurrentUser() userId: string,
    @Param('id') artworkId: string,
  ) {
    return this.artworkService.delete(artworkId, userId);
  }

  @Post(':id/remix')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get remix data for an artwork' })
  @ApiResponse({ status: 200, type: RemixRequestResponseDto })
  async getRemixData(
    @CurrentUser() userId: string,
    @Param('id') artworkId: string,
  ) {
    const artwork = await this.artworkService.getArtworkForRemix(artworkId);

    return {
      originalArtwork: {
        id: artwork.id,
        prompt: artwork.prompt,
        imageUrl: artwork.imageUrl,
      },
      remixToken: `remix-${artworkId}-${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600000), // 1 hour expiry
    };
  }

  @Get(':id/remixes')
  @ApiOperation({ summary: 'Get remixes of an artwork' })
  @ApiResponse({ status: 200, type: ArtworkListResponseDto })
  async getRemixes(
    @Param('id') artworkId: string,
    @Query() query: GetArtworksDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);

    return this.artworkService.getRemixes(artworkId, page, limit);
  }

  @Post(':id/generate-video')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a video from an existing artwork' })
  @ApiResponse({ status: 200 })
  async generateVideo(
    @Param('id') artworkId: string,
    @Body() body: { prompt?: string },
  ) {
    // Fetch raw artwork to get prompt data
    const artwork = await this.artworkRepository.findOne({
      where: { id: artworkId },
    });
    if (!artwork) {
      throw new HttpException('Artwork not found', 404);
    }

    // Extract prompt text - prompt is stored as object with 'text' or 'prompt' property
    let promptText = body?.prompt;
    if (!promptText && artwork.prompt) {
      const p = artwork.prompt as Record<string, unknown>;
      promptText =
        (p.text as string) || (p.prompt as string) || JSON.stringify(p);
    }
    promptText = promptText || 'A beautiful cinematic scene with smooth motion';

    // Extract base64 image data from imageUrl (could be data URI or regular URL)
    let imageBase64: string;
    if (artwork.imageUrl.startsWith('data:image')) {
      // Extract base64 from data URI
      imageBase64 = artwork.imageUrl.split(',')[1];
    } else {
      // Fetch image and convert to base64
      const response = await fetch(artwork.imageUrl);
      if (!response.ok) {
        throw new HttpException('Failed to fetch artwork image', 500);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      imageBase64 = buffer.toString('base64');
    }

    const result = await this.imageGenerationService.generateVideo(
      imageBase64,
      promptText,
    );

    if (result.videoUrl) {
      await this.artworkService.updateVideoUrl(artworkId, result.videoUrl);
    }

    return {
      success: true,
      videoUrl: result.videoUrl,
    };
  }
}
