import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class ImageGenerationService {
  constructor(private configService: ConfigService) { }

  async generateImage(
    prompt: string,
    negativePrompt?: string,
    style?: string,
    aspectRatio?: string,
    quality?: number
  ): Promise<{ base64: string, mimeType: string }> {
    const apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
    if (!apiKey) {
      throw new HttpException('HUGGINGFACE_API_KEY not configured in backend .env', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Using FLUX.1-schnell: one of the best and fastest open-source models for Image Generation on HuggingFace
    const url = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';

    // 1. Build Style Modifiers
    let styleInjection = '';
    if (style === 'anime') styleInjection = 'Style: Japanese anime, vivid, expressive. ';
    else if (style === 'dreamescape') styleInjection = 'Style: Studio Ghibli, soft, dreamy magic. ';
    else if (style === 'lineArt') styleInjection = 'Style: Clean pencil sketch, hand-drawn feel. ';

    // 2. Build Quality Modifiers
    let qualityInjection = 'High quality, detailed';
    if (quality && quality >= 4) {
      qualityInjection = 'Masterpiece, 8k resolution, ultra-detailed, best quality';
    }

    // 3. Construct Final Prompt
    let fullPrompt = `${styleInjection}${prompt}. ${qualityInjection}.`;

    // 4. Map Aspect Ratios constraint
    let width = 1024;
    let height = 1024;
    if (aspectRatio === 'portrait') {
      width = 768;
      height = 1024;
    } else if (aspectRatio === 'landscape') {
      width = 1024;
      height = 768;
    } else if (aspectRatio === 'widescreen') {
      width = 1280;
      height = 720;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: fullPrompt,
          parameters: {
            width,
            height,
            negative_prompt: (negativePrompt && negativePrompt.trim() !== '') ? negativePrompt : undefined,
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('HuggingFace API Error:', errorText);

        if (response.status === 401 || response.status === 403) {
          throw new HttpException('HuggingFace API: Invalid Token or Unauthorized. Please check your HUGGINGFACE_API_KEY.', HttpStatus.UNAUTHORIZED);
        } else if (response.status === 429) {
          throw new HttpException('HuggingFace API: Rate limit exceeded. Please wait a moment.', HttpStatus.TOO_MANY_REQUESTS);
        } else if (response.status === 503 || errorText.includes('loading')) {
          throw new HttpException('HuggingFace API: Model is currently loading/warming up. Please try again in 30 seconds.', HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException(`Failed to generate image: ${response.statusText}`, HttpStatus.BAD_GATEWAY);
      }

      // Hugging Face strictly returns raw image bytes natively (usually JPEG/PNG)
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString('base64');

      const contentType = response.headers.get('content-type') || 'image/jpeg';

      return {
        base64: base64Image,
        mimeType: contentType,
      };

    } catch (error) {
      console.error('ImageGenerationService error:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Internal error calling HuggingFace API', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async analyzeDrawing(base64Image: string): Promise<string> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new HttpException('GEMINI_API_KEY not configured in backend .env', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Using only confirmed-available models from this API key (discovered via ListModels)
    const modelsToTry = [
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash-lite',
    ];

    let lastError = null;
    const genAI = new GoogleGenerativeAI(apiKey);
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/png"
      },
    };
    const prompt = "You are a professional prompt engineer. The user has explicitly drawn a loose, rapid sketch of an idea they want to generate using an AI image generator. Your job is to describe what the drawing depicts in extremely rich, vivid, descriptive language so that it can be fed directly to a high-end image generator (like FLUX.1) to create class a masterpiece. Add gorgeous, cohesive artistic adjectives. Be highly imaginative if the drawing is vague, but remain loyal to its distinct core shapes (e.g., if there is a stick figure with a sword, describe an epic knight; if it is a squiggly house, describe a cozy architectural cabin). Crucial rule: ONLY output the prompt text. Absolutely NO conversational filler, no 'This is a drawing of...', and no introductory remarks. Start directly with the subject.";

    for (const modelName of modelsToTry) {
      try {
        console.log(`Analyzing sketch with ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      } catch (err) {
        console.warn(`${modelName} failed or busy:`, err.message || err);
        lastError = err;
        // If it's a 429 or 503, continue to next model. 
        // If it's an Auth error, we should probably stop but for now we'll try next.
        continue;
      }
    }

    // If we reach here, all models failed
    console.error('All Gemini vision models failed:', lastError);
    throw new HttpException(
      'AI Sketch Interpretation is currently under heavy load. Please try again in a few seconds or enter a text prompt directly.',
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }

  /**
   * Generate 3 similar images for a prompt.
   */
  async generateSimilarImages(
    prompt: string,
    negativePrompt?: string,
    style?: string,
    aspectRatio?: string
  ): Promise<Array<{ base64: string, mimeType: string }>> {
    const images = [];
    // We run 3 parallel requests to Hugging Face to get diverse results
    // We add a random 'variation' to each prompt to ensure they aren't exactly the same if seed isn't sticky.
    const variations = [
      ' Cinematic lighting, highly detailed.',
      ' Soft focus, artistic brush strokes.',
      ' Sharp details, vibrant colors.'
    ];

    const promises = variations.map(v =>
      this.generateImage(prompt + v, negativePrompt, style, aspectRatio, 4)
    );

    return Promise.all(promises);
  }

  /**
   * Hugging Face Video Generation (img2vid) with multiple fallbacks
   */
  async generateVideo(imageB64: string, prompt: string): Promise<{ videoUrl: string }> {
    const apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
    const dedicatedEndpoint = this.configService.get<string>('HUGGINGFACE_VIDEO_ENDPOINT');

    if (!apiKey) {
      throw new HttpException('HUGGINGFACE_API_KEY not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // 0. Try Dedicated Endpoint first if set (Highest priority)
    if (dedicatedEndpoint) {
      try {
        console.log(`Attempting video generation with dedicated endpoint: ${dedicatedEndpoint}...`);
        const buffer = Buffer.from(imageB64, 'base64');
        const response = await fetch(dedicatedEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'image/png',
          },
          body: buffer,
          signal: AbortSignal.timeout(180000), // 3 mins for dedicated
        });

        if (response.ok) {
          const videoBuffer = await response.arrayBuffer();
          const videoBase64 = Buffer.from(videoBuffer).toString('base64');
          return { videoUrl: `data:video/mp4;base64,${videoBase64}` };
        } else {
          console.warn(`Dedicated endpoint failed (${response.status}): ${await response.text()}`);
        }
      } catch (err) {
        console.error('Error calling dedicated endpoint:', err.message);
      }
    }

    // 1. Try Image-to-Video first (Premium experience)
    const img2VidModels = [
      'https://router.huggingface.co/hf-inference/models/Wan-AI/Wan2.1-I2V-14B-720P',
      'https://router.huggingface.co/hf-inference/models/Wan-AI/Wan2.1-I2V-14B-480P',
    ];

    for (const url of img2VidModels) {
      try {
        console.log(`Attempting img2vid with ${url.split('/').pop()}...`);
        const buffer = Buffer.from(imageB64, 'base64');

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'image/png',
          },
          body: buffer,
          signal: AbortSignal.timeout(120000), // Extended timeout for video
        });

        if (response.ok) {
          const videoBuffer = await response.arrayBuffer();
          const videoBase64 = Buffer.from(videoBuffer).toString('base64');
          return { videoUrl: `data:video/mp4;base64,${videoBase64}` };
        } else {
          const respClone = response.clone();
          const errorText = await respClone.text();
          console.warn(`img2vid model ${url.split('/').pop()} failed (${response.status}): ${errorText.substring(0, 100)}`);

          // If model is loading, we should probably wait or retry later, but for now we continue to next model/fallback
          if (response.status === 503) {
            console.log(`Model ${url.split('/').pop()} is loading/warming up...`);
          }

          // Try JSON method as fallback for the same model if binary fails (some models prefer this)
          console.log(`Retrying ${url.split('/').pop()} with JSON method...`);
          const responseJson = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              inputs: imageB64,
              parameters: {
                seed: Math.floor(Math.random() * 1000000),
              }
            }),
            signal: AbortSignal.timeout(90000),
          });
          if (responseJson.ok) {
            const videoBuffer = await responseJson.arrayBuffer();
            const videoBase64 = Buffer.from(videoBuffer).toString('base64');
            return { videoUrl: `data:video/mp4;base64,${videoBase64}` };
          }
        }
      } catch (err) {
        console.error(`Error calling ${url}:`, err.message);
      }
    }

    // 2. Try VisionCraft fallback if Hugging Face fails
    const visionCraftKey = this.configService.get<string>('VISIONCRAFT_API_KEY');
    if (visionCraftKey) {
      try {
        console.log('Attempting VisionCraft fallback for video...');
        const response = await fetch('https://visioncraft.top/api/v1/generate/video', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${visionCraftKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'svd',
            image: imageB64,
            prompt: prompt,
          }),
          signal: AbortSignal.timeout(120000), // 2 mins for VisionCraft
        });

        if (response.ok) {
          const data = await response.json() as any;
          if (data.videoUrl) {
            return { videoUrl: data.videoUrl };
          }
        } else {
          console.warn(`VisionCraft failed (${response.status}): ${await response.text()}`);
        }
      } catch (err) {
        console.error('Error calling VisionCraft:', err.message);
      }
    }

    // 3. Fallback to Text-to-Video models if img2vid fails
    return this.generateTextToVideo(prompt);
  }

  private async generateTextToVideo(prompt: string): Promise<{ videoUrl: string }> {
    const apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
    const txt2VidModels = [
      'https://router.huggingface.co/hf-inference/models/Tencent/HunyuanVideo',
      'https://router.huggingface.co/hf-inference/models/Lightricks/LTX-Video',
      'https://router.huggingface.co/hf-inference/models/Wan-AI/Wan2.1-T2V-1.3B',
      'https://router.huggingface.co/hf-inference/models/ByteDance/AnimateDiff-Lightning',
    ];

    let lastError: any = null;

    for (const url of txt2VidModels) {
      try {
        console.log(`Attempting text2vid fallback with ${url.split('/').pop()}...`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: prompt }),
          signal: AbortSignal.timeout(120000), // 120s timeout for txt2vid
        });

        if (response.ok) {
          const videoBuffer = await response.arrayBuffer();
          const videoBase64 = Buffer.from(videoBuffer).toString('base64');
          return { videoUrl: `data:video/mp4;base64,${videoBase64}` };
        } else {
          const status = response.status;
          const errorText = await response.text();
          console.warn(`text2vid model ${url.split('/').pop()} failed (${status}): ${errorText.substring(0, 100)}`);
          lastError = { status, text: errorText };
        }
      } catch (err) {
        console.error(`Error calling ${url}:`, err.message);
        lastError = err;
      }
    }

    // All models failed
    if (lastError?.status === 503) {
      throw new HttpException('AI Video models are currently loading or at capacity at HuggingFace. Please try again in 2-3 minutes.', HttpStatus.SERVICE_UNAVAILABLE);
    } else if (lastError?.status === 429) {
      throw new HttpException('HuggingFace Video: Rate limit reached for your token. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    } else if (lastError?.status === 404) {
      throw new HttpException('Selected AI Video models are not available for free serverless inference. Please configure a VisionCraft API Key or Dedicated Endpoint for best results.', HttpStatus.BAD_GATEWAY);
    }

    throw new HttpException('Video generation currently unavailable across all pipelines. The models may be too large for free serverless inference.', HttpStatus.BAD_GATEWAY);
  }

  /**
   * Analyze an image to determine the best musical vibe (genre, mood, instrument).
   * Returns a comma-separated string for Beatoven prompt.
   */
  async analyzeImageForMusic(imageB64: string): Promise<string> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not configured, using fallback music keywords');
      return 'ambient, calm, peaceful, piano';
    }

    const modelsToTry = [
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash-lite',
    ];

    const genAI = new GoogleGenerativeAI(apiKey);
    const base64Data = imageB64.replace(/^data:image\/\w+;base64,/, '');
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/png"
      },
    };

    const prompt = "You are a professional music supervisor. Analyze this image and determine the perfect musical atmosphere. Return exactly 4 keywords representing: Genre, Mood 1, Mood 2, Primary Instrument. Format: 'Genre, Mood1, Mood2, Instrument'. ONLY return these words, no punctuation or extra text.";

    for (const modelName of modelsToTry) {
      try {
        console.log(`Analyzing image for music with ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });
        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text().trim();
        if (text && text.split(',').length >= 3) {
          return text;
        }
      } catch (err) {
        console.warn(`${modelName} failed for music analysis:`, err.message || err);
        continue;
      }
    }

    console.warn('All Gemini models failed for music analysis, using fallback');
    return 'ambient, calm, peaceful, piano'; // Safe fallback
  }
}
