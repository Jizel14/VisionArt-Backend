import { Controller, Get, Post, Delete, Query, Param, Body, UseGuards, HttpException, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from '../reports/reports.service';

import { ImageGenerationService } from './image-generation.service';
import { ArtworksService } from './artworks.service';

@ApiTags('artworks')
@Controller('social/artworks')
export class ArtworksController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly imageGenerationService: ImageGenerationService,
    private readonly artworksService: ArtworksService,
  ) {}
  @Get('feed/public')
  @ApiOperation({ summary: 'Get public artwork feed' })
  async getPublicFeed(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('q') search?: string,
    @Query('filter') filter = 'recent',
  ) {
    const result = await this.artworksService.findGlobal(Number(page), Number(limit), search, filter);
    const data = await Promise.all(result.data.map(a => this.formatArtworkResponse(a)));
    return {
      data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get personalized feed (stub)' })
  async getFeed(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('sort') sort = 'recent',
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

  @Get('explore')
  @ApiOperation({ summary: 'Get explore artworks' })
  async getExplore(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('q') search?: string,
    @Query('filter') filter = 'trending',
  ) {
    const result = await this.artworksService.findGlobal(Number(page), Number(limit), search, filter);
    const data = await Promise.all(result.data.map(a => this.formatArtworkResponse(a)));
    return {
      data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  private async formatArtworkResponse(a: any, requestingUserId?: string) {
    // Get real like & comment counts from DB
    const likeInfo = await this.artworksService.getLikeInfo(a.id, requestingUserId);
    const commentsCount = await this.artworksService.countComments(a.id);

    return {
      id: a.id,
      imageUrl: `data:${a.mimeType};base64,${a.imageData}`,
      title: a.style ? (a.style.charAt(0).toUpperCase() + a.style.slice(1)) : 'Masterpiece',
      description: a.prompt,
      likesCount: likeInfo.likesCount,
      commentsCount,
      remixCount: 0,
      isLikedByMe: likeInfo.isLikedByMe,
      isSavedByMe: false,
      isFollowedByMe: false,
      isPublic: false,
      isNSFW: false,
      createdAt: a.createdAt,
      user: { 
         id: a.user?.id || a.userId, 
         name: a.user?.name || 'User',
         email: a.user?.email || 'user@example.com',
         isVerified: false,
         isPrivateAccount: false,
         followersCount: 0,
         followingCount: 0,
         publicGenerationsCount: 0,
         createdAt: a.user?.createdAt || a.createdAt,
         updatedAt: a.user?.updatedAt || a.createdAt
      },
      videoUrl: a.videoUrl || null,
    };
  }

  @Get('me/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user artworks' })
  async getMyArtworks(
    @CurrentUser() userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('q') search?: string,
    @Query('filter') filter?: string,
  ) {
    const result = await this.artworksService.findByUser(userId, Number(page), Number(limit), search, filter);
    const data = await Promise.all(result.data.map(a => this.formatArtworkResponse(a, userId)));
    return {
      data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get user gallery' })
  async getUserGallery(
    @Param('userId') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('q') search?: string,
    @Query('filter') filter?: string,
  ) {
    const result = await this.artworksService.findByUser(userId, Number(page), Number(limit), search, filter);
    const data = await Promise.all(result.data.map(a => this.formatArtworkResponse(a, userId)));
    return {
      data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Get('mentions/users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users to mention (stub)' })
  async searchMentionUsers(
    @Query('q') query: string,
    @Query('limit') limit = 8,
  ) {
    return { data: [] };
  }

  // ─── Pinterest-like similar artworks endpoint ───────────────────────
  @Get(':id/similar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get similar artworks for a given artwork (Pinterest-style discovery)' })
  async getSimilarArtworks(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @Query('generate') generate = 'true',
    @Query('limit') limitRaw = '3',
  ) {
    const limit = Math.min(Math.max(Number(limitRaw) || 3, 1), 9);
    const artwork = await this.artworksService.findById(id);
    if (!artwork) {
      return { data: [], generated: false };
    }

    // 1. Fetch from DB first
    const dbSimilars = await this.artworksService.findSimilar(id, artwork.prompt, artwork.style, limit);
    const formatted = await Promise.all(dbSimilars.map(a => this.formatArtworkResponse(a, userId)));

    // 2. If not enough AND generate=true, generate AI images to fill the gap
    if (formatted.length < limit && generate !== 'false') {
      const needed = limit - formatted.length;
      try {
        const generatedSimilars = await this.imageGenerationService.generateSimilarImages(
          artwork.prompt,
          undefined,
          artwork.style ?? undefined,
          artwork.aspectRatio ?? undefined,
        );

        for (const s of generatedSimilars.slice(0, needed)) {
          const sArtwork = await this.artworksService.create({
            userId,  // saved under requesting user
            prompt: artwork.prompt,
            style: artwork.style ?? undefined,
            aspectRatio: artwork.aspectRatio ?? undefined,
            imageData: s.base64,
            mimeType: s.mimeType,
          });
          formatted.push(await this.formatArtworkResponse(sArtwork, userId));
        }
      } catch (err) {
        // Non-fatal: just return what we have from DB
        console.warn('Could not generate similar images:', err.message);
      }
    }

    return { data: formatted, generated: formatted.length > dbSimilars.length };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get artwork by ID' })
  async getArtwork(@Param('id') id: string) {
    const artwork = await this.artworksService.findById(id);
    if (artwork) {
      return this.formatArtworkResponse(artwork);
    }
    // Fallback stub
    return {
      id,
      imageUrl: 'https://via.placeholder.com/500',
      likesCount: 0,
      commentsCount: 0,
      remixCount: 0,
      isLikedByMe: false,
      isSavedByMe: false,
      isFollowedByMe: false,
      isPublic: true,
      isNSFW: false,
      createdAt: new Date().toISOString(),
      user: { id: 'mock-user', name: 'Mock User' },
    };
  }

  // ─── LIKES (real DB) ─────────────────────────────────────────────────
  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like an artwork' })
  async likeArtwork(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    return this.artworksService.likeArtwork(id, userId);
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlike an artwork' })
  async unlikeArtwork(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    return this.artworksService.unlikeArtwork(id, userId);
  }

  // ─── COMMENTS (real DB) ──────────────────────────────────────────────
  @Get(':id/comments')
  @ApiOperation({ summary: 'Get comments for an artwork' })
  async getComments(
    @Param('id') id: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const result = await this.artworksService.getComments(id, Number(page), Number(limit));
    return {
      data: result.data.map(c => ({
        id: c.id,
        content: c.content,
        parentCommentId: c.parentCommentId,
        createdAt: c.createdAt,
        isEdited: false,
        replies: [],
        user: {
          id: c.user?.id || c.userId,
          name: c.user?.name || 'User',
          avatarUrl: null,
        },
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Post a comment on an artwork' })
  async postComment(
    @Param('id') id: string,
    @CurrentUser() userId: string,
    @Body() body: { content: string; parentCommentId?: string; mentionedUserIds?: string[] },
  ) {
    const comment = await this.artworksService.createComment(
      id,
      userId,
      body.content,
      body.parentCommentId,
    );
    return {
      id: comment.id,
      content: comment.content,
      parentCommentId: comment.parentCommentId,
      createdAt: comment.createdAt,
      isEdited: false,
      replies: [],
      user: {
        id: comment.user?.id || comment.userId,
        name: comment.user?.name || 'User',
        avatarUrl: null,
      },
    };
  }

  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async reportArtwork(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { reason?: string; description?: string; type?: string },
  ) {
    await this.reportsService.create(userId, {
      type: body.type || 'artwork',
      targetId: id,
      subject: body.reason || 'Artwork Report',
      description: body.description || body.reason || 'Reported from app',
    });
    return { message: 'Report submitted successfully' };
  }

  @Post(':id/save')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async saveArtwork(@Param('id') id: string, @Body() body: any) {
    return { message: 'Saved' };
  }

  @Delete(':id/save')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async unsaveArtwork(@Param('id') id: string) {
    return { message: 'Unsaved' };
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a new artwork image natively via Backend utilizing HuggingFace Serverless API capabilities' })
  async generateImage(
    @CurrentUser() userId: string,
    @Body() body: { 
      prompt: string; 
      negativePrompt?: string; 
      style?: string; 
      aspectRatio?: string; 
      quality?: number;
      generateSimilar?: boolean;
    },
  ) {
    const result = await this.imageGenerationService.generateImage(
        body.prompt, 
        body.negativePrompt,
        body.style,
        body.aspectRatio,
        body.quality
    );
    
    // Auto-save generated image to user's gallery
    const artwork = await this.artworksService.create({
      userId,
      prompt: body.prompt,
      style: body.style,
      aspectRatio: body.aspectRatio,
      imageData: result.base64,
      mimeType: result.mimeType,
    });

    let similarArtworks: any[] = [];
    if (body.generateSimilar) {
      // 1. Try to find similar from DB
      const dbSimilars = await this.artworksService.findSimilar(artwork.id, body.prompt, body.style || null, 3);
      similarArtworks = await Promise.all(dbSimilars.map(a => this.formatArtworkResponse(a, userId)));

      // 2. If we don't have enough (less than 3), generate more
      if (similarArtworks.length < 3) {
          const needed = 3 - similarArtworks.length;
          const generatedSimilars = await this.imageGenerationService.generateSimilarImages(
              body.prompt,
              body.negativePrompt,
              body.style,
              body.aspectRatio
          );

          // Save generated ones and add to response
          for (const s of generatedSimilars.slice(0, needed)) {
              const sArtwork = await this.artworksService.create({
                  userId,
                  prompt: body.prompt,
                  style: body.style,
                  aspectRatio: body.aspectRatio,
                  imageData: s.base64,
                  mimeType: s.mimeType,
              });
              similarArtworks.push(await this.formatArtworkResponse(sArtwork, userId));
          }
      }
    }

    return {
      success: true,
      imageB64: result.base64,
      mimeType: result.mimeType,
      artworkId: artwork.id,
      similarArtworks: similarArtworks,
    };
  }

  @Post(':id/generate-video')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a video from an existing artwork' })
  async generateVideo(
    @Param('id') id: string,
    @Body() body: { prompt?: string },
  ) {
    const artwork = await this.artworksService.findById(id);
    if (!artwork) {
      throw new HttpException('Artwork not found', 404);
    }

    const videoPrompt = body?.prompt || artwork.prompt;
    const result = await this.imageGenerationService.generateVideo(artwork.imageData, videoPrompt);
    
    if (result.videoUrl) {
      await this.artworksService.updateVideoUrl(id, result.videoUrl);
    }

    return {
      success: true,
      videoUrl: result.videoUrl,
    };
  }

  @Post('analyze-drawing')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Analyze a user drawing with Gemini Vision and return a text prompt' })
  async analyzeDrawing(
    @Body() body: { imageB64: string },
  ) {
    const prompt = await this.imageGenerationService.analyzeDrawing(body.imageB64);
    return {
      success: true,
      prompt,
    };
  }
}
