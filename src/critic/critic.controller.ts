import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { CriticService } from './critic.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

export class AnalyzeArtDto {
    imageUrl?: string;
    image?: string; // base64
    prompt?: string;
}

export class GenerateArtDto {
    prompt: string;
    negativePrompt?: string;
}

@Controller('critic')
export class CriticController {
    constructor(private readonly criticService: CriticService) { }

    @Post('analyze')
    @UseGuards(JwtAuthGuard)
    async analyze(@Body() dto: AnalyzeArtDto) {
        const feedback = await this.criticService.analyzeArt(
            dto.imageUrl,
            dto.prompt,
            dto.image,
        );
        return { feedback };
    }

    @Post('generate')
    @UseGuards(JwtAuthGuard)
    async generate(@Body() dto: GenerateArtDto) {
        const imageBuffer = await this.criticService.generateArt(
            dto.prompt,
            dto.negativePrompt,
        );
        // Convert Buffer to base64 so it can be easily sent in JSON
        return { imageBase64: imageBuffer.toString('base64') };
    }

    @Post('generate-caption')
    @UseGuards(JwtAuthGuard)
    async generateCaption(@Body() dto: GenerateArtDto) {
        return await this.criticService.generateCaption(dto.prompt);
    }
}
