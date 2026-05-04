import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  preheader?: string;
  bodyText: string;
  bodyHtml: string;
  unsubscribeUrl: string;
  trackingPixelUrl: string;
}

export interface MailResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

/**
 * Pluggable email sender. Supports:
 *   - resend  (recommended, simplest)
 *   - mailgun
 *   - log     (default — just logs, no API call. Useful in dev.)
 *
 * Configure via env:
 *   MAIL_PROVIDER=resend|mailgun|log
 *   MAIL_FROM=Hello <hello@visionart.app>
 *   RESEND_API_KEY=...
 *   MAILGUN_API_KEY=...  MAILGUN_DOMAIN=...
 */
@Injectable()
export class RetentionMailerService {
  private readonly logger = new Logger(RetentionMailerService.name);
  private readonly provider: string;
  private readonly from: string;
  private readonly smtpTransport: Transporter | null;

  constructor(private readonly config: ConfigService) {
    const configuredProvider = (config.get<string>('MAIL_PROVIDER') || '').toLowerCase();
    const hasSmtp =
      !!config.get<string>('SMTP_HOST') &&
      !!config.get<string>('SMTP_USER') &&
      !!config.get<string>('SMTP_PASS');
    this.provider = configuredProvider || (hasSmtp ? 'smtp' : 'log');
    this.from = config.get<string>('MAIL_FROM') || 'VisionArt <hello@visionart.local>';

    if (this.provider === 'smtp') {
      const host = config.getOrThrow<string>('SMTP_HOST');
      const port = Number(config.get<string>('SMTP_PORT') || 587);
      const secure = String(config.get<string>('SMTP_SECURE') || 'false') === 'true';
      const user = config.getOrThrow<string>('SMTP_USER');
      const pass = config.getOrThrow<string>('SMTP_PASS');
      this.smtpTransport = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
    } else {
      this.smtpTransport = null;
    }
  }

  async send(msg: MailMessage): Promise<MailResult> {
    switch (this.provider) {
      case 'smtp':
        return this.sendSmtp(msg);
      case 'resend':
        return this.sendResend(msg);
      case 'mailgun':
        return this.sendMailgun(msg);
      default:
        this.logger.log(
          `[MAIL:LOG] to=${msg.to} subject="${msg.subject}" (provider=log, no real send)`,
        );
        return { ok: true, providerId: `log-${Date.now()}` };
    }
  }

  private async sendSmtp(msg: MailMessage): Promise<MailResult> {
    if (!this.smtpTransport) {
      return { ok: false, error: 'SMTP transport not configured' };
    }
    try {
      const info = await this.smtpTransport.sendMail({
        from: this.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.bodyText,
        html: msg.bodyHtml,
        headers: {
          'List-Unsubscribe': `<${msg.unsubscribeUrl}>`,
        },
      });
      return { ok: true, providerId: (info.messageId as string) || 'smtp' };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  private async sendResend(msg: MailMessage): Promise<MailResult> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' };
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [msg.to],
          subject: msg.subject,
          html: msg.bodyHtml,
          text: msg.bodyText,
          headers: {
            'List-Unsubscribe': `<${msg.unsubscribeUrl}>`,
          },
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: `resend HTTP ${res.status}: ${txt}` };
      }
      const data = (await res.json()) as { id?: string };
      return { ok: true, providerId: data.id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  private async sendMailgun(msg: MailMessage): Promise<MailResult> {
    const apiKey = this.config.get<string>('MAILGUN_API_KEY');
    const domain = this.config.get<string>('MAILGUN_DOMAIN');
    if (!apiKey || !domain) {
      return { ok: false, error: 'MAILGUN_API_KEY or MAILGUN_DOMAIN missing' };
    }
    try {
      const form = new URLSearchParams();
      form.append('from', this.from);
      form.append('to', msg.to);
      form.append('subject', msg.subject);
      form.append('html', msg.bodyHtml);
      form.append('text', msg.bodyText);
      form.append('h:List-Unsubscribe', `<${msg.unsubscribeUrl}>`);
      form.append('o:tracking', 'yes');
      form.append('o:tracking-clicks', 'htmlonly');
      form.append('o:tracking-opens', 'yes');

      const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: `mailgun HTTP ${res.status}: ${txt}` };
      }
      const data = (await res.json()) as { id?: string };
      return { ok: true, providerId: data.id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
