import {
  Injectable,
  HttpException,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

/** Full text for Gemini / Google SDK errors (message alone may omit status codes). */
function stringifyUnknownError(err: unknown): string {
  if (err instanceof Error) {
    const anyErr = err as Error & { cause?: unknown };
    const cause = anyErr.cause != null ? ` cause=${stringifyUnknownError(anyErr.cause)}` : '';
    return `${err.name}: ${err.message}${cause}`;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Style reference images (Wikimedia Commons) for KIE / Bylo-style reference transfer.
 * When no match, KIE still runs with only the user photo + a text prompt.
 */
const ARTIST_STYLE_REFERENCE: ReadonlyArray<{
  test: (n: string) => boolean;
  url: string;
}> = [
  {
    test: (n) => n.includes('van gogh') || n.includes('vangogh'),
    url:
      'https://upload.wikimedia.org/wikipedia/commons/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
  },
  {
    test: (n) => n.includes('monet'),
    url:
      'https://upload.wikimedia.org/wikipedia/commons/5/59/Monet_-_Impression%2C_Sunrise.jpg',
  },
  {
    test: (n) => n.includes('picasso'),
    url:
      'https://upload.wikimedia.org/wikipedia/en/4/4c/Les_Demoiselles_d%27Avignon.jpg',
  },
  {
    test: (n) => n.includes('dali') || n.includes('dalí'),
    url:
      'https://upload.wikimedia.org/wikipedia/en/d/dd/The_Persistence_of_Memory.jpg',
  },
  {
    test: (n) => n.includes('da vinci') || n.includes('davinci'),
    url:
      'https://upload.wikimedia.org/wikipedia/commons/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg',
  },
  {
    test: (n) => n.includes('rembrandt'),
    url:
      'https://upload.wikimedia.org/wikipedia/commons/2/28/De_Nachtwacht.jpg',
  },
];

function resolveArtistStyleReferenceUrl(artist: string): string | undefined {
  const n = artist.trim().toLowerCase();
  for (const entry of ARTIST_STYLE_REFERENCE) {
    if (entry.test(n)) return entry.url;
  }
  return undefined;
}

/** Quota/rate-limit: avoid spamming retries and verbose logs across models. */
function isLikelyGeminiQuotaError(err: unknown): boolean {
  const s = stringifyUnknownError(err).toLowerCase();
  return (
    /\b429\b/.test(s) ||
    s.includes('too many requests') ||
    s.includes('quota exceeded') ||
    s.includes('resource_exhausted') ||
    s.includes('rate-limit') ||
    s.includes('free_tier') ||
    s.includes('generativelanguage.googleapis.com')
  );
}

@Injectable()
export class ImageGenerationService {
  private readonly logger = new Logger(ImageGenerationService.name);

  constructor(private configService: ConfigService) {}

  /** When true (.env GEMINI_SKIP_VISION=true): skip Gemini image analysis entirely. */
  private shouldSkipGeminiVision(): boolean {
    const v =
      this.configService.get<string>('GEMINI_SKIP_VISION') ??
      this.configService.get<string>('GEMINI_VISION_DISABLED');
    return v?.trim().toLowerCase() === 'true' || v?.trim() === '1';
  }

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

  /**
   * Clipdrop replace-background: **keeps the segmented foreground as-is** and only swaps the backdrop.
   * Good for props on a desk, not true “ repaint the character in Van Gogh ” — prefer HF img2img for that.
   */
  private buildClipdropArtistPrompt(artist: string): string {
    const a = artist.trim();
    return [
      `Fine art masterpiece strongly inspired by ${a}: signature palette, brushwork, and rhythm of ${a}.`,
      `Seamless painterly rendering; museum quality; preserve subject identity, pose, and composition.`,
      `Rich artistic environment and lighting coherent with ${a}'s era and technique.`,
    ].join(' ')
      .slice(0, 950);
  }

  /** Instruction tuned for HF image→image models (whole canvas restyled like the artist). */
  private buildHfArtistInstruction(artist: string): string {
    const a = artist.trim();
    const s =
      `Transform the ENTIRE photograph into one cohesive ${a} oil painting — thick visible brush strokes, iconic colors and rhythms of ${a} all over canvas, museum quality. Preserve subject identity and composition; no cartoon cel-shading; no photo snapshot look.`;
    return s.slice(0, 700);
  }

  /**
   * Full-image stylistic repaint via Hugging Face image-to-image.
   * @see https://huggingface.co/docs/inference-providers/tasks/image-to-image
   */
  async styleTransferViaHuggingFaceImg2Img(
    base64Image: string,
    artist: string,
  ): Promise<{ base64: string; mimeType: string; modelUsed: string }> {
    const apiKeyRaw =
      (this.configService.get<string>('HUGGINGFACE_API_KEY') ??
        process.env.HUGGINGFACE_API_KEY ??
        '') as string;
    const apiKey = apiKeyRaw.replace(/^\uFEFF/, '').trim();
    if (!apiKey) {
      throw new HttpException(
        'HUGGINGFACE_API_KEY not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const raw = base64Image.replace(/^data:image\/\w+;base64,/, '').trim();
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 image payload');
    }
    if (buffer.length === 0) {
      throw new BadRequestException('Empty image data');
    }
    if (buffer.length > 20 * 1024 * 1024) {
      throw new BadRequestException('Image too large for style transfer (max 20MB)');
    }

    const modelUsed = (
      (this.configService.get<string>('STYLE_TRANSFER_HF_MODEL') ??
        process.env.STYLE_TRANSFER_HF_MODEL ??
        'timbrooks/instruct-pix2pix') as string
    )
      .trim()
      .replace(/^\uFEFF/, '');

    const url = `https://router.huggingface.co/hf-inference/models/${modelUsed}`;
    const prompt = this.buildHfArtistInstruction(artist);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: raw,
        parameters: {
          prompt,
          negative_prompt:
            'anime screenshot, glossy 3d render, cellphone photo snapshot, blurry, watermark, text, malformed limbs',
          guidance_scale: 9,
          num_inference_steps: 30,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.warn(
        `HF style-transfer ${modelUsed} (${response.status}): ${errorText.slice(0, 500)}`,
      );
      let httpStatus = HttpStatus.BAD_GATEWAY;
      if (response.status === 401 || response.status === 403) {
        httpStatus = HttpStatus.UNAUTHORIZED;
      } else if (response.status === 429) {
        httpStatus = HttpStatus.TOO_MANY_REQUESTS;
      } else if (response.status === 503 || response.status === 502) {
        httpStatus = HttpStatus.SERVICE_UNAVAILABLE;
      } else if (response.status >= 400 && response.status < 500) {
        httpStatus = HttpStatus.BAD_REQUEST;
      }
      throw new HttpException(
        `Hugging Face style transfer failed (${response.status}). Check STYLE_TRANSFER_HF_MODEL and quotas — ${errorText.slice(0, 280)}`,
        httpStatus,
      );
    }

    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    let mimeType = contentType.startsWith('image/')
      ? contentType.split(';')[0].trim()
      : 'image/jpeg';

    if (!contentType.startsWith('image/')) {
      const textProbe = buf.toString('utf8', 0, Math.min(buf.length, 900)).trimStart();
      if (textProbe.startsWith('{')) {
        throw new HttpException(
          `HF style transfer returned JSON instead of an image (${modelUsed}): ${textProbe.slice(0, 600)}`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      if (buf.slice(0, 3).compare(Buffer.from([0xff, 0xd8, 0xff])) === 0) {
        mimeType = 'image/jpeg';
      } else if (
        buf.length >= 8 &&
        buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ) {
        mimeType = 'image/png';
      }
    }

    return {
      base64: buf.toString('base64'),
      mimeType,
      modelUsed,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Prompt for KIE Nano Banana Edit (same model family promoted by Bylo / kie.ai). */
  private buildKieStylePrompt(
    artist: string,
    withStyleReferenceImage: boolean,
  ): string {
    const a = artist.trim();
    if (withStyleReferenceImage) {
      return [
        `Edit the FIRST image (user photo): adopt the visual style of the SECOND image — brushwork, palette, texture, and artistic energy only.`,
        `Do not copy the second image's subject or scene; keep identity, pose, and layout from the first image.`,
        `Overall look must match the spirit of ${a}.`,
      ]
        .join(' ')
        .slice(0, 5000);
    }
    return [
      `Transform the entire image into a museum-quality artwork strongly in the manner of ${a}: characteristic colors, brush rhythm, and period-appropriate media.`,
      `Preserve subject identity and composition; style must read as ${a} across the whole frame.`,
    ]
      .join(' ')
      .slice(0, 5000);
  }

  private async kiePollUntilResultUrl(
    apiKey: string,
    baseUrl: string,
    taskId: string,
  ): Promise<string> {
    const deadline = Date.now() + 14 * 60 * 1000;
    let delayMs = 2000;

    while (Date.now() < deadline) {
      const res = await fetch(
        `${baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );

      const json = (await res.json()) as {
        code?: number;
        msg?: string;
        data?: {
          state?: string;
          resultJson?: string;
          failMsg?: string;
        };
      };

      if (json.code === 200 && json.data?.state) {
        const { state, resultJson, failMsg } = json.data;
        if (state === 'success' && resultJson) {
          try {
            const parsed = JSON.parse(resultJson) as { resultUrls?: string[] };
            const u = parsed.resultUrls?.[0];
            if (u) {
              return u;
            }
          } catch {
            throw new HttpException(
              'KIE: could not parse resultJson',
              HttpStatus.BAD_GATEWAY,
            );
          }
          throw new HttpException(
            'KIE: success but no result URL',
            HttpStatus.BAD_GATEWAY,
          );
        }
        if (state === 'fail') {
          throw new HttpException(
            `KIE task failed: ${failMsg || json.msg || 'unknown'}`,
            HttpStatus.BAD_GATEWAY,
          );
        }
      }

      await this.sleep(delayMs);
      delayMs = Math.min(Math.floor(delayMs * 1.25), 12000);
    }

    throw new HttpException(
      'KIE: timeout waiting for style transfer',
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }

  /**
   * Bylo-style reference transfer via **KIE** `google/nano-banana-edit` (async job + poll).
   * Source image must be a URL reachable **from the public internet** (KIE servers fetch it).
   */
  async styleTransferViaKieNanoBananaEdit(
    artist: string,
    contentImagePublicUrl: string,
  ): Promise<{ base64: string; mimeType: string; modelUsed: string }> {
    const apiKeyRaw =
      (this.configService.get<string>('KIE_API_KEY') ??
        process.env.KIE_API_KEY ??
        '') as string;
    const apiKey = apiKeyRaw.replace(/^\uFEFF/, '').trim();
    if (!apiKey) {
      throw new BadRequestException(
        'KIE_API_KEY manquant. Crée une clé sur https://kie.ai/api-key (flux équivalent Bylo / Nano Banana Edit).',
      );
    }

    const baseUrl = (
      this.configService.get<string>('KIE_API_BASE_URL') ??
      process.env.KIE_API_BASE_URL ??
      'https://api.kie.ai'
    )
      .trim()
      .replace(/\/+$/, '');

    const modelUsed = (
      (this.configService.get<string>('KIE_NANO_BANANA_MODEL') ??
        process.env.KIE_NANO_BANANA_MODEL ??
        'google/nano-banana-edit') as string
    ).trim();

    // FORCE withRef to false to prevent KIE from failing with 'Gemini could not generate an image'
    // when providing a second style reference image URL.
    const styleRefUrl = resolveArtistStyleReferenceUrl(artist);
    const withRef = false; // Forced to false to prevent 502 Bad Gateway
    const imageUrls = [contentImagePublicUrl.trim()];

    const prompt = this.buildKieStylePrompt(artist, withRef);

    const createRes = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelUsed,
        input: {
          prompt,
          image_urls: imageUrls,
          output_format: 'png',
          image_size: 'auto' as const,
        },
      }),
    });

    const created = (await createRes.json()) as {
      code?: number;
      msg?: string;
      data?: { taskId?: string };
    };

    if (created.code !== 200 || !created.data?.taskId) {
      let httpStatus = HttpStatus.BAD_GATEWAY;
      if (created.code === 401) httpStatus = HttpStatus.UNAUTHORIZED;
      else if (created.code === 402) httpStatus = HttpStatus.PAYMENT_REQUIRED;
      else if (created.code === 429) httpStatus = HttpStatus.TOO_MANY_REQUESTS;
      else if (created.code === 422) httpStatus = HttpStatus.BAD_REQUEST;

      throw new HttpException(
        `KIE createTask failed: ${created.msg ?? createRes.statusText} (${JSON.stringify(created).slice(0, 500)})`,
        httpStatus,
      );
    }

    const outUrl = await this.kiePollUntilResultUrl(
      apiKey,
      baseUrl,
      created.data.taskId,
    );

    const imgRes = await fetch(outUrl);
    if (!imgRes.ok) {
      throw new HttpException(
        `KIE: could not download result (${imgRes.status})`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    const ct = imgRes.headers.get('content-type') || '';
    let mimeType = ct.startsWith('image/')
      ? ct.split(';')[0].trim()
      : 'image/png';

    if (!ct.startsWith('image/')) {
      if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) {
        mimeType = 'image/jpeg';
      } else if (
        buf.length >= 8 &&
        buf
          .slice(0, 8)
          .equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          )
      ) {
        mimeType = 'image/png';
      }
    }

    return {
      base64: buf.toString('base64'),
      mimeType,
      modelUsed,
    };
  }

  /**
   * Style transfer orchestration:
   * - **auto** (default): KIE / Bylo-style Nano Banana Edit (if `KIE_API_KEY` + public source URL) → HF img2img → Clipdrop.
   * - **kie** \| **bylo**: KIE only (`google/nano-banana-edit` on api.kie.ai).
   * - **huggingface**: HF only.
   * - **clipdrop**: Clipdrop replace-background only.
   */
  async styleTransferUserImage(
    base64Image: string,
    artist: string,
    options?: { contentImagePublicUrl?: string },
  ): Promise<{
    base64: string;
    mimeType: string;
    provider: 'huggingface' | 'clipdrop' | 'kie';
    hfModel?: string;
    kieModel?: string;
  }> {
    const mode = (
      (this.configService.get<string>('STYLE_TRANSFER_PROVIDER') ??
        process.env.STYLE_TRANSFER_PROVIDER ??
        'auto') as string
    )
      .trim()
      .toLowerCase();

    const runClipdrop = async () => {
      const out = await this.styleTransferViaClipDrop(base64Image, artist);
      return { ...out, provider: 'clipdrop' as const };
    };

    if (mode === 'clipdrop') {
      return await runClipdrop();
    }

    const runKie = async () => {
      const url = options?.contentImagePublicUrl?.trim();
      if (!url) {
        if (mode === 'kie' || mode === 'bylo') {
          throw new BadRequestException(
            'URL publique de l’image manquante — le contrôleur doit enregistrer le fichier sous /audio/file/.',
          );
        }
        return null;
      }
      try {
        const out = await this.styleTransferViaKieNanoBananaEdit(artist, url);
        return {
          base64: out.base64,
          mimeType: out.mimeType,
          provider: 'kie' as const,
          kieModel: out.modelUsed,
        };
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        if (mode === 'kie' || mode === 'bylo') throw e;
        this.logger.warn(
          `Style transfer: KIE (Bylo-class) skipped — ${stringifyUnknownError(e).slice(0, 450)}`,
        );
        return null;
      }
    };

    const runHf = async () => {
      try {
        const out = await this.styleTransferViaHuggingFaceImg2Img(
          base64Image,
          artist,
        );
        return {
          base64: out.base64,
          mimeType: out.mimeType,
          provider: 'huggingface' as const,
          hfModel: out.modelUsed,
        };
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        if (mode === 'huggingface') throw e;
        this.logger.warn(
          `Style transfer: Hugging Face path skipped — ${stringifyUnknownError(e).slice(0, 400)}`,
        );
        return null;
      }
    };

    if (mode === 'kie' || mode === 'bylo') {
      return (await runKie()) as {
        base64: string;
        mimeType: string;
        provider: 'kie';
        kieModel?: string;
      };
    }

    if (mode === 'huggingface') {
      return (await runHf()) as {
        base64: string;
        mimeType: string;
        provider: 'huggingface';
        hfModel?: string;
      };
    }

    const kie = await runKie();
    if (kie) {
      return kie;
    }

    const hf = await runHf();
    if (hf) {
      return hf;
    }

    this.logger.warn(
      'Using Clipdrop replace-background as fallback. For Bylo-style results set KIE_API_KEY + PUBLIC_API_BASE_URL, or use HUGGINGFACE_API_KEY.',
    );
    return await runClipdrop();
  }

  /**
   * Style transfer using Clipdrop Replace Background API (user image + prompt).
   * https://clipdrop.co/apis/docs/replace-background
   */
  async styleTransferViaClipDrop(
    base64Image: string,
    artist: string,
  ): Promise<{ base64: string; mimeType: string }> {
    // ConfigService + process.env + trim BOM invisible parfois collé au nom dans .env
    const rawKey =
      (this.configService.get<string>('CLIPDROP_API_KEY') ??
        process.env.CLIPDROP_API_KEY ??
        ''
      ).replace(/^\uFEFF/, '');

    const apiKey = rawKey.trim();
    if (!apiKey) {
      this.logger.error(
        'CLIPDROP_API_KEY introuvable au runtime (vérifie le .env à la racine visionart-back-master et redémarre Nest).',
      );
      throw new BadRequestException(
        'CLIPDROP_API_KEY is not configured. Add it to backend .env (project root visionart-back-master), restart Nest, and confirm the Flutter app calls this same backend URL.',
      );
    }

    const raw = base64Image.replace(/^data:image\/\w+;base64,/, '');
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 image payload');
    }

    if (buffer.length === 0) {
      throw new BadRequestException('Empty image data');
    }

    if (buffer.length > 20 * 1024 * 1024) {
      throw new BadRequestException('Image too large for Clipdrop (max 20MB)');
    }

    // Detect mime type from magic bytes to prevent Clipdrop 400 corrupted image error
    let mimeType = 'image/jpeg';
    let filename = 'input.jpg';
    if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      mimeType = 'image/png';
      filename = 'input.png';
    } else if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
      mimeType = 'image/webp';
      filename = 'input.webp';
    }

    const prompt = this.buildClipdropArtistPrompt(artist);
    const form = new FormData();
    form.append(
      'image_file',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename,
    );
    form.append('prompt', prompt);

    const res = await fetch('https://clipdrop-api.co/replace-background/v1', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        Accept: 'image/png',
      },
      body: form,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      let detail = await res.text();
      try {
        const j = JSON.parse(detail) as { error?: string };
        detail = j?.error ?? detail;
      } catch {
        // keep raw
      }

      let httpStatus = HttpStatus.BAD_GATEWAY;
      if (res.status === 401 || res.status === 403) {
        httpStatus = HttpStatus.UNAUTHORIZED;
      } else if (res.status === 402) {
        httpStatus = HttpStatus.PAYMENT_REQUIRED;
      } else if (res.status === 429) {
        httpStatus = HttpStatus.TOO_MANY_REQUESTS;
      } else if (res.status === 503) {
        httpStatus = HttpStatus.SERVICE_UNAVAILABLE;
      } else if (res.status >= 400 && res.status < 500) {
        httpStatus = HttpStatus.BAD_REQUEST;
      }

      throw new HttpException(
        `Clipdrop replace-background failed (${res.status}): ${detail}`,
        httpStatus,
      );
    }

    if (!contentType.startsWith('image/')) {
      throw new HttpException(
        `Clipdrop returned unexpected content-type: ${contentType}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const out = Buffer.from(arrayBuffer);
    return {
      base64: out.toString('base64'),
      mimeType: contentType.split(';')[0].trim(),
    };
  }

  async analyzeDrawing(base64Image: string): Promise<string> {
    if (this.shouldSkipGeminiVision()) {
      console.warn(
        'GEMINI_SKIP_VISION is set — skipping Gemini sketch analysis (fallback prompt).',
      );
      return 'A detailed portrait-style composition with clear subject, clean contours, balanced framing, rich textures and expressive lighting.';
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      console.warn(
        'GEMINI_API_KEY not configured — skipping Gemini sketch analysis (fallback prompt).',
      );
      return 'A detailed portrait-style composition with clear subject, clean contours, balanced framing, rich textures and expressive lighting.';
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
        lastError = err;
        const fallbackSketch =
          'A detailed portrait-style composition with clear subject, clean contours, balanced framing, rich textures and expressive lighting.';
        if (isLikelyGeminiQuotaError(err)) {
          console.warn(
            `Gemini sketch analysis skipped (${modelName}): quota/rate limit. Using fallback prompt.`,
          );
          return fallbackSketch;
        }
        console.warn(
          `${modelName} failed or busy:`,
          stringifyUnknownError(err).slice(0, 500),
        );
        continue;
      }
    }

    // If we reach here, all models failed. Do not block user flow.
    console.error('All Gemini vision models failed:', lastError);
    return 'A coherent artistic scene with strong composition, readable subject, nuanced colors, cinematic lighting and fine detail.';
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
    if (this.shouldSkipGeminiVision()) {
      return 'ambient, calm, peaceful, piano';
    }

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
        if (isLikelyGeminiQuotaError(err)) {
          console.warn(
            `Gemini music vision skipped (${modelName}): quota/rate limit. Using fallback keywords.`,
          );
          return 'ambient, calm, peaceful, piano';
        }
        console.warn(
          `${modelName} failed for music analysis:`,
          stringifyUnknownError(err).slice(0, 400),
        );
        continue;
      }
    }

    console.warn('All Gemini models failed for music analysis, using fallback');
    return 'ambient, calm, peaceful, piano'; // Safe fallback
  }
}
