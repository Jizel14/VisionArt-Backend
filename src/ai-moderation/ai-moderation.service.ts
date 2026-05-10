import { Injectable, Logger } from '@nestjs/common';

export interface ModerationResult {
  flagged: boolean;
  reason: string | null;
  severity: 'low' | 'medium' | 'high' | null;
}

const FALLBACK: ModerationResult = { flagged: false, reason: null, severity: null };

@Injectable()
export class AiModerationService {
  private readonly logger = new Logger(AiModerationService.name);
  private readonly model = 'nvidia/nemotron-3-nano-30b-a3b:free';

  async moderate(text: string): Promise<ModerationResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENROUTER_API_KEY not set — skipping AI moderation');
      return FALLBACK;
    }

    const trimmed = text.trim();
    if (!trimmed) return FALLBACK;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://visionart.app',
          'X-Title': 'VisionArt Moderation',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a content moderation system. Analyze the text and respond ONLY with valid JSON: {"flagged":boolean,"reason":string|null,"severity":"low"|"medium"|"high"|null}. Flag hate speech, harassment, explicit sexual content, graphic violence, spam, illegal activity, or personal attacks. If clean, set flagged:false and reason/severity to null.',
            },
            { role: 'user', content: trimmed },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 100,
          temperature: 0,
        }),
      });

      if (!res.ok) {
        this.logger.warn(`OpenRouter returned HTTP ${res.status} — failing open`);
        return FALLBACK;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = data?.choices?.[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as ModerationResult;

      const result: ModerationResult = {
        flagged: Boolean(parsed.flagged),
        reason: parsed.reason ?? null,
        severity: parsed.severity ?? null,
      };

      if (result.flagged) {
        this.logger.warn(
          `[AI-MOD] Flagged [${result.severity}]: "${trimmed.substring(0, 80)}" — ${result.reason}`,
        );
      }

      return result;
    } catch (err) {
      this.logger.error('AI moderation call failed — failing open', err);
      return FALLBACK;
    } finally {
      clearTimeout(timeout);
    }
  }
}
