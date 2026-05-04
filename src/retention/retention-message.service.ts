import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RetentionPayload,
  RetentionSegment,
  RetentionContext,
} from './entities/retention-action.entity';

/**
 * Builds a retention email/notification body for a given segment + context.
 * 1. Tries Ollama (local LLM) for personalized copy.
 * 2. Falls back to a static segment-specific template if the LLM fails or
 *    returns invalid JSON.
 *
 * The LLM is instructed to output JSON; we never trust prose blindly.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL =
  process.env.RETENTION_OLLAMA_MODEL || 'qwen2.5:3b-instruct';
const OLLAMA_FALLBACK_MODEL =
  process.env.RETENTION_OLLAMA_FALLBACK_MODEL || 'qwen2.5-coder:0.5b';
const OLLAMA_TIMEOUT_MS = Number(process.env.RETENTION_OLLAMA_TIMEOUT_MS || 120_000);

@Injectable()
export class RetentionMessageService {
  private readonly logger = new Logger(RetentionMessageService.name);

  constructor(private readonly config: ConfigService) {}

  async buildMessage(
    segment: RetentionSegment,
    context: RetentionContext,
    variant: string | null = null,
  ): Promise<RetentionPayload> {
    try {
      const llm = await this.askOllama(segment, context, variant);
      const validated = this.validatePayload(llm);
      if (validated) {
        return { ...validated, source: 'llm' };
      }
      this.logger.warn(
        `LLM payload invalid for segment=${segment}; falling back to static template`,
      );
    } catch (e) {
      this.logger.warn(
        `LLM call failed for segment=${segment}: ${(e as Error).message}; falling back`,
      );
    }
    return { ...this.staticTemplate(segment, context), source: 'fallback' };
  }

  // ── Ollama ────────────────────────────────────────────────────────────────

  private async askOllama(
    segment: RetentionSegment,
    context: RetentionContext,
    variant: string | null,
  ): Promise<RetentionPayload | null> {
    const system = this.systemPrompt();
    const user = this.userPrompt(segment, context, variant);

    // Warmup/retry strategy:
    // - First call may be slow when the runner is cold → allow bigger timeout.
    // - If Ollama returns 500 (common during cold start), retry once with a smaller output budget.
    const prompt = `${system}\n\n${user}`;
    const first = await this.callOllama(prompt, {
      model: OLLAMA_MODEL,
      num_predict: 180,
    });
    if (first.ok) return first.payload;

    if (first.httpStatus === 500) {
      this.logger.warn(
        `Ollama 500 (cold start likely) — retrying once with smaller num_predict`,
      );
      const second = await this.callOllama(prompt, {
        model: OLLAMA_MODEL,
        num_predict: 120,
      });
      if (second.ok) return second.payload;
    }

    // Fallback model attempt (often much faster / more stable)
    if (OLLAMA_FALLBACK_MODEL && OLLAMA_FALLBACK_MODEL !== OLLAMA_MODEL) {
      this.logger.warn(
        `Primary model failed; trying fallback model=${OLLAMA_FALLBACK_MODEL}`,
      );
      const third = await this.callOllama(prompt, {
        model: OLLAMA_FALLBACK_MODEL,
        num_predict: 140,
      });
      if (third.ok) return third.payload;
    }

    throw new Error(first.error ?? 'ollama failed');
  }

  private async callOllama(
    prompt: string,
    options: { model: string; num_predict: number },
  ): Promise<{
    ok: boolean;
    payload: RetentionPayload | null;
    error?: string;
    httpStatus?: number;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    const t0 = Date.now();
    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          prompt,
          stream: false,
          keep_alive: '30m',
          options: {
            // Lower temperature & shorter outputs -> fewer failures and less latency.
            temperature: 0.2,
            num_predict: options.num_predict,
            top_p: 0.9,
            // Keep context reasonable for stability on small hardware.
            num_ctx: 2048,
          },
        }),
        signal: controller.signal,
      });
      const elapsed = Date.now() - t0;
      if (!res.ok) {
        return { ok: false, payload: null, httpStatus: res.status, error: `ollama HTTP ${res.status}` };
      }
      const data = (await res.json()) as { response?: string };
      this.logger.debug(`Ollama responded in ${elapsed}ms`);
      const txt = (data.response ?? '').trim();
      if (!txt) return { ok: false, payload: null, error: 'empty ollama response' };

      try {
        return { ok: true, payload: JSON.parse(txt) as RetentionPayload };
      } catch {
        const match = txt.match(/\{[\s\S]*\}/);
        if (!match) return { ok: false, payload: null, error: 'no json object in response' };
        return { ok: true, payload: JSON.parse(match[0]) as RetentionPayload };
      }
    } catch (e) {
      return { ok: false, payload: null, error: (e as Error).message };
    } finally {
      clearTimeout(timeout);
    }
  }

  private validatePayload(p: RetentionPayload | null): RetentionPayload | null {
    if (!p) return null;
    if (typeof p.subject !== 'string' || p.subject.length < 4 || p.subject.length > 120)
      return null;
    if (typeof p.body !== 'string' || p.body.length < 30 || p.body.length > 600)
      return null;
    if (typeof p.cta_label !== 'string' || p.cta_label.length < 2 || p.cta_label.length > 40)
      return null;
    // Refuse output that still contains template placeholders
    if (/\{\{|\}\}/.test(p.body) || /\{\{|\}\}/.test(p.subject)) return null;
    return {
      subject: p.subject.trim(),
      preheader: typeof p.preheader === 'string' ? p.preheader.slice(0, 140) : undefined,
      body: p.body.trim(),
      cta_label: p.cta_label.trim(),
      tone: p.tone,
    };
  }

  private systemPrompt(): string {
    return [
      'Tu es responsable rétention chez VisionArt, une app mobile française de création artistique IA.',
      'Tu écris des messages courts, chaleureux, jamais agressifs, en tutoyant.',
      'Tu DOIS répondre en JSON STRICT: {"subject": "...", "preheader": "...", "body": "...", "cta_label": "...", "tone": "warm|urgent|celebratory|apologetic|informative"}.',
      'Le body fait 2 à 4 phrases courtes (max 500 caractères). Pas de markdown, pas d\'emojis.',
      'Pas de mensonge marketing — utilise UNIQUEMENT les variables fournies.',
      'Si une variable est manquante, n\'invente pas, reste générique sur ce point.',
    ].join(' ');
  }

  private userPrompt(
    segment: RetentionSegment,
    ctx: RetentionContext,
    variant: string | null,
  ): string {
    const intent = SEGMENT_INTENT[segment];
    const variantHint =
      variant === 'urgent'
        ? 'Ton: léger sentiment d\'urgence sans menace.'
        : variant === 'celebratory'
          ? 'Ton: célébratoire et reconnaissant.'
          : 'Ton: chaleureux et bienveillant.';

    const vars = JSON.stringify(
      {
        firstName: ctx.firstName,
        daysAway: ctx.daysAway,
        topStyle: ctx.topStyle,
        lastArtTitle: ctx.lastArtTitle,
        loyaltyPoints: ctx.loyaltyPoints,
        discountPct: ctx.discountPct,
        promoCode: ctx.promoCode,
        totalArtworks: ctx.totalArtworks,
      },
      null,
      0,
    );

    return [
      `SEGMENT: ${segment}`,
      `INTENTION: ${intent}`,
      variantHint,
      `VARIABLES: ${vars}`,
      'Rédige le message en JSON. N\'écris RIEN d\'autre que le JSON.',
    ].join('\n');
  }

  // ── Fallback templates ────────────────────────────────────────────────────

  private staticTemplate(
    segment: RetentionSegment,
    ctx: RetentionContext,
  ): RetentionPayload {
    const name = ctx.firstName || 'l\'artiste';
    const promo = ctx.promoCode ? ` Code: ${ctx.promoCode}.` : '';
    const discount = ctx.discountPct ? `${ctx.discountPct}%` : '';

    const tpl: Record<RetentionSegment, RetentionPayload> = {
      [RetentionSegment.NEW_TRIAL]: {
        subject: `Bienvenue sur VisionArt, ${name}`,
        body: `Tu viens de rejoindre VisionArt. Pour bien démarrer, lance ta première création IA en moins d\'une minute. On a hâte de voir ce que tu vas imaginer.`,
        cta_label: 'Créer ma première œuvre',
        tone: 'warm',
      },
      [RetentionSegment.ENGAGED_FREE]: {
        subject: `${name}, tu es proche de ta limite mensuelle`,
        body: `Tu as utilisé presque tout ton quota gratuit du mois. Passe en PRO pour des créations illimitées et débloque tout le potentiel de VisionArt.${promo}`,
        cta_label: 'Découvrir PRO',
        tone: 'informative',
      },
      [RetentionSegment.IDLE_FREE]: {
        subject: `${name}, ta toile t\'attend`,
        body: `Ça fait ${ctx.daysAway ?? 14} jours qu\'on ne t\'a pas vu. Reviens créer une œuvre, c\'est rapide et gratuit.`,
        cta_label: 'Reprendre',
        tone: 'warm',
      },
      [RetentionSegment.POWER_USER_FREE]: {
        subject: `${name}, tu mérites mieux que la version gratuite`,
        body: `Tu utilises VisionArt à fond — pourquoi se limiter ? Avec PRO, plus de quota, plus de styles, plus de liberté.${discount ? ` Profite de ${discount} de remise.` : ''}${promo}`,
        cta_label: 'Passer en PRO',
        tone: 'celebratory',
      },
      [RetentionSegment.WIN_BACK_30]: {
        subject: `${name}, tu nous manques`,
        body: `Ça fait ${ctx.daysAway ?? 30} jours. On a relancé tes outils favoris et on te garde une remise de ${discount || '30%'} si tu reviens cette semaine.${promo}`,
        cta_label: 'Revenir créer',
        tone: 'warm',
      },
      [RetentionSegment.WIN_BACK_60]: {
        subject: `${name}, on a améliorée plein de choses`,
        body: `Deux mois sans nouvelles. Nouveaux styles, génération plus rapide, et une remise de ${discount || '40%'} t\'attendent.${promo}`,
        cta_label: 'Voir ce qui a changé',
        tone: 'urgent',
      },
      [RetentionSegment.LOST]: {
        subject: `${name}, dernière invitation`,
        body: `On aimerait te montrer où VisionArt en est. ${discount || '50%'} de remise valable pour le mois si tu reviens maintenant.${promo}`,
        cta_label: 'Donner une seconde chance',
        tone: 'apologetic',
      },
      [RetentionSegment.RETURNING]: {
        subject: `Content de te revoir, ${name}`,
        body: `Ravis que tu sois revenu. Continue où tu t\'étais arrêté${ctx.lastArtTitle ? ` — ta dernière œuvre "${ctx.lastArtTitle}" t\'attend` : ''}.`,
        cta_label: 'Reprendre',
        tone: 'celebratory',
      },
      [RetentionSegment.LOYAL_PRO]: {
        subject: `Merci ${name}, ${ctx.monthsActive ?? 3} mois avec nous`,
        body: `Ton soutien compte. Tu as ${ctx.loyaltyPoints ?? 0} points fidélité — convertis-les en mois PRO offerts dès 500 points.`,
        cta_label: 'Voir mes avantages',
        tone: 'celebratory',
      },
      [RetentionSegment.CHURN_RISK_PRO]: {
        subject: `${name}, ton abonnement se termine bientôt`,
        body: `On a remarqué que tu utilises moins VisionArt cette période. Avant ton renouvellement, voici un mois bonus${discount ? ` ou ${discount} de remise` : ''} pour rester avec nous.${promo}`,
        cta_label: 'Renouveler',
        tone: 'informative',
      },
      [RetentionSegment.LAPSED_PRO_3D]: {
        subject: `${name}, ton voyage continue ?`,
        body: `Ton abonnement vient de se terminer. Voici un récapitulatif de tes ${ctx.totalArtworks ?? 'nombreuses'} créations — reviens quand tu veux, sans pression.`,
        cta_label: 'Voir mes œuvres',
        tone: 'warm',
      },
      [RetentionSegment.LAPSED_PRO_7D]: {
        subject: `${name}, ${discount || '30%'} pour reprendre PRO`,
        body: `Reprends ton abonnement avec ${discount || '30%'} de remise sur le premier mois.${promo}`,
        cta_label: 'Réactiver PRO',
        tone: 'urgent',
      },
      [RetentionSegment.LAPSED_PRO_30D]: {
        subject: `${name}, dernière chance de reprendre PRO`,
        body: `Cela fait un mois. Voici une offre exceptionnelle: ${discount || '50%'} de remise sur le premier mois pour revenir.${promo}`,
        cta_label: 'Profiter de l\'offre',
        tone: 'urgent',
      },
      [RetentionSegment.PAYMENT_FAILED]: {
        subject: `${name}, problème avec ton paiement`,
        body: `On n\'a pas pu prélever ton dernier paiement. Mets à jour ta méthode de paiement pour conserver ton accès PRO.`,
        cta_label: 'Mettre à jour',
        tone: 'informative',
      },
    };

    return tpl[segment];
  }
}

const SEGMENT_INTENT: Record<RetentionSegment, string> = {
  [RetentionSegment.NEW_TRIAL]:
    'Souhaiter la bienvenue, encourager la première création.',
  [RetentionSegment.ENGAGED_FREE]:
    'Avertir qu\'il approche du quota et proposer PRO en bénéfice.',
  [RetentionSegment.IDLE_FREE]:
    'Le réengager doucement sans le culpabiliser.',
  [RetentionSegment.POWER_USER_FREE]:
    'Le valoriser comme power user et proposer PRO avec remise.',
  [RetentionSegment.WIN_BACK_30]:
    'Reconnaître son absence courte et offrir une remise modérée.',
  [RetentionSegment.WIN_BACK_60]:
    'Mettre en avant les nouveautés et offrir une remise significative.',
  [RetentionSegment.LOST]:
    'Dernière tentative chaleureuse avec offre forte.',
  [RetentionSegment.RETURNING]:
    'Célébrer son retour et l\'aider à reprendre où il en était.',
  [RetentionSegment.LOYAL_PRO]:
    'Le remercier pour sa fidélité, mentionner ses points loyalty.',
  [RetentionSegment.CHURN_RISK_PRO]:
    'Anticiper le non-renouvellement avec offre de fidélité.',
  [RetentionSegment.LAPSED_PRO_3D]:
    'Relance douce avec résumé de ses créations, sans pression.',
  [RetentionSegment.LAPSED_PRO_7D]:
    'Offre claire de réactivation avec remise.',
  [RetentionSegment.LAPSED_PRO_30D]:
    'Offre exceptionnelle pour récupération longue durée.',
  [RetentionSegment.PAYMENT_FAILED]:
    'Message transactionnel pour mettre à jour sa CB. Pas de promo.',
};
