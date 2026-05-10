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
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
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
import {
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { StorageService } from '../../storage/storage.service';

class StyleTransferDto {
  @IsString()
  @MinLength(10)
  imageBase64: string;

  @IsString()
  @MinLength(2)
  artist: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

function extFromImageBuffer(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) {
    return 'jpg';
  }
  if (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return 'jpg';
}

@ApiTags('Social - Artworks')
@Controller('social/artworks')
export class ArtworksController {
  private readonly logger = new Logger(ArtworksController.name);

  constructor(
    private artworkService: ArtworkService,
    private imageGenerationService: ImageGenerationService,
    private storageService: StorageService,
    @InjectRepository(Artwork)
    private artworkRepository: Repository<Artwork>,
  ) {}

  /**
   * Preferred public URL base for artworks (Flutter must reach this host).
   * Example Android emulator + API on PC: PUBLIC_API_BASE_URL=http://10.0.2.2:3000
   */
  private publicBackendBaseUrl(req: Request): string {
    const configured = process.env.PUBLIC_API_BASE_URL?.trim();
    if (configured) {
      return configured.replace(/\/+$/, '');
    }

    const forwardedProto = req.get('x-forwarded-proto');
    const forwardedHost = req.get('x-forwarded-host');
    if (forwardedHost) {
      const proto = forwardedProto ?? 'http';
      return `${proto}://${forwardedHost}`;
    }

    const host =
      req.get('host') ?? `${process.env.HOST ?? 'localhost'}:${process.env.PORT ?? 3000}`;
    const encrypted = (req as Request & { secure?: boolean }).secure ?? false;
    const proto = forwardedProto ?? (encrypted ? 'https' : 'http');
    return `${proto}://${host}`;
  }

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

  @Post('style-transfer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Apply artist style transfer from uploaded base64 image',
  })
  @ApiResponse({ status: 201, type: ArtworkResponseDto })
  async styleTransfer(
    @CurrentUser() userId: string,
    @Body() dto: StyleTransferDto,
    @Req() req: Request,
  ) {
    const normalizedBase64 = dto.imageBase64.trim();
    if (!normalizedBase64) {
      throw new BadRequestException('imageBase64 is required');
    }

    const artist = dto.artist.trim();
    if (!artist) {
      throw new BadRequestException('artist is required');
    }

    const rawB64 = normalizedBase64.replace(/^data:image\/\w+;base64,/, '');
    let srcBuf: Buffer;
    try {
      srcBuf = Buffer.from(rawB64, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 image payload');
    }
    if (srcBuf.length === 0) {
      throw new BadRequestException('Empty image data');
    }
    const inExt = extFromImageBuffer(srcBuf);
    const inName = `st_in_${randomUUID()}.${inExt}`;
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    fs.writeFileSync(path.join(tempDir, inName), srcBuf);
    
    let contentPublicUrl = `${this.publicBackendBaseUrl(req)}/audio/file/${inName}`;
    // Upload to a temporary public host to guarantee a direct URL for KIE API (especially useful for localhost/emulator dev)
    try {
      const form = new FormData();
      form.append("files[]", new Blob([new Uint8Array(srcBuf)], {type: `image/${inExt}`}), inName);
      const uploadRes = await fetch("https://uguu.se/upload", { method: "POST", body: form });
      const uploadData = await uploadRes.json() as any;
      if (uploadData?.success && uploadData.files?.[0]?.url) {
        contentPublicUrl = uploadData.files[0].url.trim();
        this.logger.log(`Uploaded source image to uguu.se for KIE: ${contentPublicUrl}`);
      } else {
        // Fallback to catbox
        const catboxForm = new FormData();
        catboxForm.append("reqtype", "fileupload");
        catboxForm.append("fileToUpload", new Blob([new Uint8Array(srcBuf)], {type: `image/${inExt}`}), inName);
        const catboxRes = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: catboxForm });
        const uploadedUrl = await catboxRes.text();
        if (uploadedUrl && uploadedUrl.startsWith('http')) {
          contentPublicUrl = uploadedUrl.trim();
          this.logger.log(`Uploaded source image to catbox.moe for KIE: ${contentPublicUrl}`);
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to upload to public host: ${e}`);
    }

    const generated = await this.imageGenerationService.styleTransferUserImage(
      normalizedBase64,
      artist,
      { contentImagePublicUrl: contentPublicUrl },
    );

    const bytes = Buffer.from(generated.base64, 'base64');
    const isPng = generated.mimeType.toLowerCase().includes('png');
    const ext = isPng ? 'png' : 'jpg';

    let imageUrl: string;
    try {
      const uploaded = await this.storageService.uploadPublicBuffer({
        buffer: bytes,
        contentType: generated.mimeType || 'image/jpeg',
        prefix: 'artworks/style-transfer',
        fileExt: ext,
        userId,
      });
      imageUrl = uploaded.publicUrl;
    } catch (err: unknown) {
      this.logger.warn(
        'MinIO/S3 upload failed; saving style-transfer image to temp and serving via /audio/file/',
      );
      if (err instanceof Error) this.logger.warn(err.message);
      const fileName = `st_${randomUUID()}.${ext}`;
      const dir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, fileName), bytes);
      imageUrl = `${this.publicBackendBaseUrl(req)}/audio/file/${fileName}`;
    }

    return this.artworkService.create(userId, {
      imageUrl,
      isPublic: dto.isPublic ?? true,
      title: `Style Transfer • ${artist}`,
      description: `Style transfer generated in the style of ${artist}.`,
      prompt: {
        type: 'style-transfer',
        artist,
        source: 'user-image',
        provider: generated.provider,
        ...(generated.provider === 'huggingface'
          ? { hfModel: generated.hfModel ?? '' }
          : generated.provider === 'kie'
            ? {
                kieModel: generated.kieModel ?? 'google/nano-banana-edit',
              }
            : { endpoint: 'replace-background/v1' }),
      },
      metadata: {
        mode: 'style-transfer',
        artist,
        provider: generated.provider,
        ...(generated.hfModel ? { hfModel: generated.hfModel } : {}),
        ...(generated.kieModel ? { kieModel: generated.kieModel } : {}),
      },
    } as CreateArtworkDto);
  }
}
