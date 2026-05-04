import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch'; // More stable fetch for Node.js environments

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

        // Fallback to Pollinations.ai (Free, No-Auth API) when Hugging Face fails due to limits or other errors
        console.log('Attempting fallback to Pollinations AI...');
        try {
          const encodedPrompt = encodeURIComponent(fullPrompt);
          const pollUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true`;
          const pollResponse = await fetch(pollUrl);

          if (pollResponse.ok) {
            const arrayBuffer = await pollResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return {
              base64: buffer.toString('base64'),
              mimeType: pollResponse.headers.get('content-type') || 'image/jpeg',
            };
          } else {
            console.error('Pollinations API Error:', await pollResponse.text());
          }
        } catch (fallbackErr) {
          console.error('Pollinations fallback failed:', fallbackErr);
        }

        // If fallback also fails, throw the original HuggingFace errors
        if (response.status === 401 || response.status === 403) {
          throw new HttpException('HuggingFace API: Invalid Token or Unauthorized. Please check your HUGGINGFACE_API_KEY.', HttpStatus.UNAUTHORIZED);
        } else if (response.status === 429) {
          throw new HttpException('HuggingFace API: Rate limit exceeded. Please wait a moment.', HttpStatus.TOO_MANY_REQUESTS);
        } else if (response.status === 503 || errorText.includes('loading')) {
          throw new HttpException('HuggingFace API: Model is currently loading/warming up. Please try again in 30 seconds.', HttpStatus.SERVICE_UNAVAILABLE);
        }
        // Specific error for depleted credits
        if (errorText.includes('depleted your monthly included credits')) {
          throw new HttpException('HuggingFace API: Your account has depleted its monthly included credits. Please upgrade or use a different account.', HttpStatus.BAD_GATEWAY);
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
   * AI Video Generation (text-to-video) using Wan-AI/Wan2.1 via Gradio (FREE)
   * Fallback chain: Wan2.1 → Pixabay stock video → sample video
   */
  async generateVideo(imageB64: string, prompt: string): Promise<{ videoUrl: string }> {
    const videoPrompt = prompt || 'A beautiful cinematic scene with smooth motion';

    // ─── 1. PRIMARY: Wan-AI/Wan2.1 Text-to-Video via Gradio (FREE) ─────────
    try {
      console.log('Attempting text-to-video with Wan-AI/Wan2.1 Gradio Space...');
      const { client } = await import('@gradio/client');
      const hfToken = this.configService.get<string>('HUGGINGFACE_API_KEY');

      const app = await client('Wan-AI/Wan2.1', {
        hf_token: hfToken as any,
      });

      // Step 1: Submit the async T2V generation job
      console.log('Submitting T2V job to Wan2.1...');
      try {
        await app.predict('/t2v_generation_async', [
          videoPrompt,     // prompt
          '1280*720',      // resolution
          false,           // watermark (disabled)
          -1,              // seed (-1 = random)
        ]);
      } catch (submitErr) {
        console.warn('Initial submission error (might be fine if job started):', submitErr.message);
      }
      
      console.log('T2V job submitted, polling for result...');

      // Step 2: Poll /status_refresh until the video is ready (max 15 min)
      const maxPolls = 180;       // 180 polls × 5s = 15 min max
      const pollInterval = 5000;  // 5 seconds

      for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, pollInterval));

        try {
          // We try status_refresh to get updates
          const refreshResult = await app.predict('/status_refresh', [null, null, null]);
          const resultData = refreshResult?.data;

          if (resultData && Array.isArray(resultData)) {
            // Scan for progress in all potential slots (usually slot 7, but let's be safe)
            for (const item of resultData) {
              if (item && typeof item === 'object' && item.label && typeof item.label === 'string') {
                if (item.label.includes('Generating') || item.label.includes('Queue')) {
                  // Clean up weird progress strings like (89041%)Generating
                  const cleanLabel = item.label.replace(/\(\d+%\)/, '').trim();
                  if (i % 6 === 0) { // Log every 30s to avoid spam
                    console.log(`Wan2.1 status: ${cleanLabel} (Poll ${i+1}/${maxPolls})`);
                  }
                }
              }
            }

            // Scan ALL slots for a video object/URL, not just index 0
            for (const slotValue of resultData) {
              if (slotValue && typeof slotValue === 'object' && slotValue.value) {
                const val = slotValue.value;
                const videoUrl = typeof val === 'string'
                  ? val
                  : val.video?.url || val.video?.path || val.url;

                if (videoUrl && typeof videoUrl === 'string' && videoUrl.startsWith('http') && 
                    (videoUrl.includes('.mp4') || videoUrl.includes('.webm') || videoUrl.includes('file='))) {
                  console.log('Wan2.1 video generated successfully!', videoUrl);
                  return { videoUrl };
                }
              } else if (typeof slotValue === 'string' && slotValue.startsWith('http') && (slotValue.includes('.mp4') || slotValue.includes('.webm'))) {
                console.log('Wan2.1 video generated successfully (direct string)!', slotValue);
                return { videoUrl: slotValue };
              }
            }
          }
        } catch (pollErr) {
          // Ignore transient network errors during polling
          if (i % 12 === 0) console.warn(`Poll ${i + 1} status: ${pollErr.message}`);
        }
      }

      console.warn('Wan2.1 timed out after 15 minutes of polling.');
    } catch (err) {
      console.error('Wan-AI/Wan2.1 Gradio error:', err.message || err);
      if (err.cause) console.error('  Cause:', err.cause);
    }

    // ─── 2. FALLBACK: Pexels stock video search (no Gemini dependency) ─────
    try {
      console.log('Using Pexels stock video search fallback...');

      // Simple keyword extraction — no external AI needed
      const stopWords = new Set([
        'a','an','the','of','in','on','at','to','for','and','or','with','is','are',
        'this','that','style','high','quality','detailed','resolution','ultra','best',
        'masterpiece','cinematic','artistic','vivid','image','photo','generate',
        'create','make','draw','render','illustration','painting','digital','under','over','from','with','without'
      ]);
      const searchTerms = videoPrompt
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w)) // Increased length to 3 to filter "girl" (maybe? no girl is 4)
        .slice(0, 3)
        .join(' ');

      const searchQuery = searchTerms || 'nature landscape';
      console.log('Pexels search terms:', searchQuery);

      const PEXELS_KEY = this.configService.get<string>('PEXELS_API_KEY');
      if (!PEXELS_KEY) {
        console.warn('No PEXELS_API_KEY found in .env. Skipping Pexels fallback.');
      } else {
        const response = await fetch(
          `https://api.pexels.com/videos/search?query=${encodeURIComponent(searchQuery)}&per_page=5`,
          { headers: { 'Authorization': PEXELS_KEY } }
        );

        if (response.ok) {
          const data = await response.json() as any;
          if (data.videos?.length > 0) {
            const video = data.videos[Math.floor(Math.random() * Math.min(data.videos.length, 5))];
            const videoFile = video.video_files.find((f: any) => f.quality === 'hd' || f.quality === 'sd');
            if (videoFile) {
              console.log('Found relevant Pexels video:', videoFile.link);
              return { videoUrl: videoFile.link };
            }
          } else {
            console.log('Pexels found no videos for query:', searchQuery);
          }
        } else {
          console.warn('Pexels API failed:', response.status, response.statusText);
        }
      }
    } catch (err) {
      console.error('Pexels fallback error:', err.message);
      if (err.cause) console.error('  Cause:', err.cause);
    }

    // ─── 3. ABSOLUTE LAST RESORT — sample video so the UI never breaks ────
    console.warn('All video generation methods failed. Returning sample video.');
    return { videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4' };
  }
}
