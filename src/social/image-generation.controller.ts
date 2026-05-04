import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ImageGenerationService } from './image-generation.service';

class GenerateImageDto {
  prompt!: string;
  negativePrompt?: string;
  style?: string;
  aspectRatio?: string;
  quality?: number;
}

class GenerateSimilarDto {
  prompt!: string;
  negativePrompt?: string;
  style?: string;
  aspectRatio?: string;
}

class AnalyzeDrawingDto {
  base64Image!: string;
}

@Controller('image-generation')
@UseGuards(JwtAuthGuard)
export class ImageGenerationController {
  constructor(private readonly imageGen: ImageGenerationService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generate(@Body() dto: GenerateImageDto) {
    return this.imageGen.generateImage(
      dto.prompt,
      dto.negativePrompt,
      dto.style,
      dto.aspectRatio,
      dto.quality,
    );
  }

  @Post('generate-similar')
  @HttpCode(HttpStatus.OK)
  async generateSimilar(@Body() dto: GenerateSimilarDto) {
    const images = await this.imageGen.generateSimilarImages(
      dto.prompt,
      dto.negativePrompt,
      dto.style,
      dto.aspectRatio,
    );
    return { images };
  }

  @Post('analyze-drawing')
  @HttpCode(HttpStatus.OK)
  async analyzeDrawing(@Body() dto: AnalyzeDrawingDto) {
    const prompt = await this.imageGen.analyzeDrawing(dto.base64Image);
    return { prompt };
  }
}
