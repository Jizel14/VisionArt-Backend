import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class AiAudioService {
  private readonly logger = new Logger(AiAudioService.name);
  private readonly beatovenBaseUrl = 'https://public-api.beatoven.ai/api/v1';
  private readonly udioapiBaseUrl = 'https://udioapi.pro';
  
  private useUdioapi = true;

  constructor(private readonly configService: ConfigService) {}

  async generatePlaylistFromPreferences(
    aesthetics: string[],
    colors: string[],
    mood: string | null,
  ): Promise<string[]> {
    const promptElements = [
      ...aesthetics,
      ...colors.map(c => `${c} tones`),
      ...(mood ? [`${mood} mood`] : []),
    ];
    
    const basePrompt = promptElements.join(', ') || 'ambient electronic';

    try {
      this.logger.log(`Generating playlist for prompt: "${basePrompt}" using ${this.useUdioapi ? 'UdioAPI' : 'Beatoven.ai'}`);
      
      const tracks: string[] = [];
      const trackCount = 3;
      
      const genre = this.mapToBeatovenGenre(aesthetics);
      const beatovenMood = this.mapToBeatovenMood(mood);

      for (let i = 0; i < trackCount; i++) {
        const generationPrompt = `${basePrompt} (Variation ${i + 1})`;
        this.logger.log(`Generating track ${i + 1} of ${trackCount}...`);
        
        try {
          let url: string | null = null;
          
          if (this.useUdioapi) {
            try {
              url = await this.callUdioapiGen(generationPrompt);
            } catch (udioError) {
              this.logger.warn(`UdioAPI failed, falling back to Beatoven: ${udioError.message}`);
              url = await this.callBeatovenGen(generationPrompt, genre, beatovenMood);
            }
          } else {
            url = await this.callBeatovenGen(generationPrompt, genre, beatovenMood);
          }

          if (url) {
            tracks.push(url);
          }
        } catch (e) {
          this.logger.error(`Failed to generate track ${i + 1}: ${e.message}`);
          // If we get a 402 (Payment Required/Insufficient credits), stop trying for this session
          if (e.message.includes('402')) {
            this.logger.warn('Stopping generation due to insufficient credits');
            break; 
          }
        }
      }

      return tracks;
    } catch (error) {
      this.logger.error('Failed to generate playlist via Beatoven.ai', error);
      return [];
    }
  }

  private mapToBeatovenGenre(aesthetics: string[]): string {
    const aes = aesthetics.join(', ').toLowerCase();
    if (aes.includes('cinematic') || aes.includes('epic')) return 'cinematic';
    if (aes.includes('electronic') || aes.includes('cyberpunk') || aes.includes('synthwave')) return 'electronic';
    if (aes.includes('lofi') || aes.includes('chill') || aes.includes('minimalist')) return 'lofi';
    if (aes.includes('rock') || aes.includes('metal')) return 'rock';
    if (aes.includes('indie') || aes.includes('folk')) return 'indie';
    if (aes.includes('pop')) return 'pop';
    return 'ambient';
  }

  private mapToBeatovenMood(mood: string | null): string {
    if (!mood) return 'calm';
    const m = mood.toLowerCase();
    if (m.includes('happy') || m.includes('joy') || m.includes('bright')) return 'happy';
    if (m.includes('sad') || m.includes('melancholy') || m.includes('dark')) return 'sad';
    if (m.includes('energetic') || m.includes('intense') || m.includes('dynamic')) return 'energetic';
    if (m.includes('calm') || m.includes('peaceful') || m.includes('relaxing')) return 'calm';
    return 'neutral';
  }

  private async callUdioapiGen(prompt: string): Promise<string | null> {
    const apiKey = this.configService.get<string>('UDIOAPI_API_KEY');
    if (!apiKey) {
      throw new Error('UDIOAPI_API_KEY is not defined in environment');
    }

    this.logger.log('Step 1: Calling UdioAPI.pro...');
    const generateData = {
      prompt: prompt,
      model: 'udio-v4',
      duration: 30
    };

    const generateRes = await fetch(`${this.udioapiBaseUrl}/docs/v2-generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(generateData)
    });

    let generateResult;
    try {
      generateResult = await generateRes.json();
    } catch (e) {
      const text = await generateRes.text();
      throw new Error(`UdioAPI Error (${generateRes.status}): ${text}`);
    }
    
    if (generateRes.status !== 200) {
        throw new Error(`UdioAPI Compose Error (${generateRes.status}): ${JSON.stringify(generateResult)}`);
    }
    
    const taskId = generateResult.task_id || generateResult.id;
    if (!taskId) throw new Error(`Missing task ID in udioapi response: ${JSON.stringify(generateResult)}`);

    this.logger.log(`Step 2: Polling for udioapi task ${taskId}...`);
    let finalDownloadUrl = null;
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const statusRes = await fetch(`${this.udioapiBaseUrl}/docs/v2-generate/status/${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      let statusData;
      try {
        statusData = await statusRes.json();
      } catch (e) {
        const text = await statusRes.text();
        this.logger.warn(`Status check failed (attempt ${attempts+1}): ${text}`);
        attempts++;
        continue;
      }
      
      const state = statusData.status || statusData.state;
      this.logger.log(`UdioAPI Task ${taskId} status: ${state} (${attempts + 1}/${maxAttempts})`);

      if (state === 'success' || state === 'SUCCESS' || state === 'completed' || (statusData.audio_url || statusData.download_url)) {
        finalDownloadUrl = statusData.audio_url || statusData.download_url;
        break;
      }
      
      if (state === 'failed' || state === 'FAILURE' || state === 'error') {
        throw new Error(`UdioAPI task failed: ${JSON.stringify(statusData)}`);
      }

      attempts++;
    }

    if (!finalDownloadUrl) {
      throw new Error(`Timeout polling for udioapi task ${taskId}`);
    }

    const fileName = `generated_${randomUUID()}.mp3`;
    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const outputPath = path.resolve(tempDir, fileName);
    this.logger.log(`Downloading track from ${finalDownloadUrl}...`);

    const audioRes = await fetch(finalDownloadUrl);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    fs.writeFileSync(outputPath, audioBuffer);

    this.logger.log(`Track saved as ${fileName}`);
    return `/audio/file/${fileName}`;
  }

  private async callBeatovenGen(prompt: string, genre: string, mood: string): Promise<string | null> {
    const apiKey = this.configService.get<string>('BEATOVEN_API_KEY');
    if (!apiKey) {
      throw new Error('BEATOVEN_API_KEY is not defined in environment');
    }

    this.logger.log('Step 1: Composing track on Beatoven.ai...');
    const composeData = {
      prompt: { text: prompt },
      genre: genre,
      mood: mood,
      format: 'mp3',
      duration: 30
    };

    const composeRes = await fetch(`${this.beatovenBaseUrl}/tracks/compose`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(composeData)
    });

    const composeResult = await composeRes.json();
    if (composeRes.status !== 200) {
        throw new Error(`Compose Error (${composeRes.status}): ${JSON.stringify(composeResult)}`);
    }
    
    const taskId = composeResult.task_id;
    if (!taskId) throw new Error(`Missing task ID in compose response: ${JSON.stringify(composeResult)}`);

    this.logger.log(`Step 2: Polling for task ${taskId}...`);
    let finalDownloadUrl = null;
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const statusRes = await fetch(`${this.beatovenBaseUrl}/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const statusData = await statusRes.json();
      
      const state = statusData.status || statusData.state;
      this.logger.log(`Task ${taskId} status: ${state} (${attempts + 1}/${maxAttempts})`);

      if (state === 'success' || state === 'SUCCESS' || (statusData.meta && (statusData.meta.track_url || statusData.meta.download_url))) {
        finalDownloadUrl = statusData.meta.track_url || statusData.meta.download_url;
        break;
      }
      
      if (state === 'failed' || state === 'FAILURE') {
        throw new Error(`Beatoven task failed: ${JSON.stringify(statusData)}`);
      }

      attempts++;
    }

    if (!finalDownloadUrl) {
      throw new Error(`Timeout polling for task ${taskId}`);
    }

    const fileName = `generated_${randomUUID()}.mp3`;
    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const outputPath = path.resolve(tempDir, fileName);
    this.logger.log(`Downloading track from ${finalDownloadUrl}...`);

    const audioRes = await fetch(finalDownloadUrl);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    fs.writeFileSync(outputPath, audioBuffer);

    this.logger.log(`Track saved as ${fileName}`);
    return `/audio/file/${fileName}`;
  }

  async generateMusicForImage(analysisKeywords: string): Promise<string | null> {
    const prompt = `Atmospheric track matching ${analysisKeywords}`;

    try {
      this.logger.log(`Generating music for image with prompt: "${prompt}"`);
      
      if (this.useUdioapi) {
        this.logger.log('Using UdioAPI.pro for generation...');
        try {
          return await this.callUdioapiGen(prompt);
        } catch (udioErr) {
          this.logger.warn('UdioAPI failed, falling back to Beatoven.ai...', udioErr);
        }
      }

      this.logger.log('Using Beatoven.ai for generation...');
      const parts = analysisKeywords.split(',').map(p => p.trim());
      const genre = parts[0] || 'ambient';
      const mood = parts[1] || 'calm';
      return await this.callBeatovenGen(prompt, genre, mood);
    } catch (error) {
      this.logger.error('Failed to generate music for image', error);
      return null;
    }
  }
}
