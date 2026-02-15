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
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ArtworkService } from './artwork.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
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
  constructor(private artworkService: ArtworkService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new artwork' })
  @ApiResponse({ status: 201, type: ArtworkResponseDto })
  async createArtwork(
    @CurrentUser() userId: string,
    @Body() dto: CreateArtworkDto,
  ) {
    return this.artworkService.create(userId, dto);
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
}
