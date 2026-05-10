import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { AiAudioService } from './ai-audio.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class GeneratePlaylistDto {
  aesthetics?: string[];
  colors?: string[];
  mood?: string | null;
}

class GenerateForImageDto {
  /// Comma-separated keywords (e.g. "ambient, calm, peaceful, piano").
  /// You can also use ImageGenerationService.analyzeImageForMusic to get them.
  keywords!: string;
}

@Controller('audio')
export class AiAudioController {
  constructor(private readonly audio: AiAudioService) {}

  /// Stream/serve an already generated audio file from /temp.
  @Get('file/:filename')
  getAudio(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.resolve(process.cwd(), 'temp', filename);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    throw new NotFoundException('Audio file not found.');
  }

  /// Generate a playlist (3 tracks) from user art preferences.
  /// Returns: { tracks: ["/audio/file/<uuid>.mp3", ...] }
  @Post('playlist')
  @UseGuards(JwtAuthGuard)
  async generatePlaylist(@Body() dto: GeneratePlaylistDto) {
    const tracks = await this.audio.generatePlaylistFromPreferences(
      dto.aesthetics ?? [],
      dto.colors ?? [],
      dto.mood ?? null,
    );
    if (!tracks || tracks.length === 0) {
      throw new HttpException(
        'Could not generate any tracks (provider quota or down).',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { tracks };
  }

  /// Generate a single track that matches an image's vibe.
  /// Body: { keywords: "genre, mood1, mood2, instrument" }
  /// Returns: { url: "/audio/file/<uuid>.mp3" }
  @Post('for-image')
  @UseGuards(JwtAuthGuard)
  async generateForImage(@Body() dto: GenerateForImageDto) {
    const url = await this.audio.generateMusicForImage(dto.keywords);
    if (!url) {
      throw new HttpException(
        'Audio generation failed (provider error).',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { url };
  }
}
