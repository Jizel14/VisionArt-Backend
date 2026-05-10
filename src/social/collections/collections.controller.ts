import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CollectionsService } from './collections.service';
import { GetSavedArtworksDto, SaveArtworkDto } from './dto/collections.dto';

@ApiTags('Social - Collections')
@Controller('social')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CollectionsController {
  constructor(private collectionsService: CollectionsService) {}

  @Post('artworks/:artworkId/save')
  @HttpCode(200)
  @ApiOperation({ summary: 'Save artwork to a collection' })
  @ApiResponse({ status: 200 })
  async saveArtwork(
    @CurrentUser() userId: string,
    @Param('artworkId') artworkId: string,
    @Body() dto: SaveArtworkDto,
  ) {
    return this.collectionsService.saveArtwork(userId, artworkId, dto);
  }

  @Delete('artworks/:artworkId/save')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove artwork from saved collections' })
  @ApiResponse({ status: 200 })
  async unsaveArtwork(
    @CurrentUser() userId: string,
    @Param('artworkId') artworkId: string,
  ) {
    return this.collectionsService.unsaveArtwork(userId, artworkId);
  }

  @Get('collections')
  @ApiOperation({ summary: 'Get my collections summary' })
  @ApiResponse({ status: 200 })
  async getCollections(@CurrentUser() userId: string) {
    return this.collectionsService.getCollections(userId);
  }

  @Get('collections/artworks')
  @ApiOperation({ summary: 'Get saved artworks (optionally by collection)' })
  @ApiResponse({ status: 200 })
  async getSavedArtworks(
    @CurrentUser() userId: string,
    @Query() query: GetSavedArtworksDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    return this.collectionsService.getSavedArtworks(
      userId,
      page,
      limit,
      query.collectionName,
    );
  }
}
