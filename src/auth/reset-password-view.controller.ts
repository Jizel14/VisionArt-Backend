import { Controller, Get, Header, Param, Post, Body, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';

/**
 * Serves the reset-password page when the user opens the link from the email.
 * GET shows the form; POST submits it (works without JavaScript).
 */
@Controller()
export class ResetPasswordViewController {
  constructor(private readonly authService: AuthService) {}

  @Get('reset-password')
  @Header('Content-Type', 'text/html; charset=utf-8')
  resetPasswordPage(
    @Query('token') token: string | undefined,
    @Query('error') error: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): void {
    res.send(this.getFormHtml(token ?? '', error ?? ''));
  }

  @Get('reset-password/:token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  resetPasswordPageWithToken(
    @Param('token') token: string,
    @Query('error') error: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): void {
    res.send(this.getFormHtml(token ?? '', error ?? ''));
  }

  @Post('reset-password')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async submitResetPassword(
    @Res({ passthrough: false }) res: Response,
    @Body() body: { token?: string; newPassword?: string; confirm?: string },
  ): Promise<void> {
    const token = (body?.token ?? '').trim();
    const newPassword = (body?.newPassword ?? '').trim();
    const confirm = (body?.confirm ?? '').trim();
    if (!token) {
      res.send(this.getFormHtml('', 'Token manquant.'));
      return;
    }
    if (newPassword.length < 6) {
      res.send(this.getFormHtml(token, 'Le mot de passe doit contenir au moins 6 caractères.'));
      return;
    }
    if (newPassword !== confirm) {
      res.send(this.getFormHtml(token, 'Les deux mots de passe ne correspondent pas.'));
      return;
    }
    try {
      await this.authService.resetPassword(token, newPassword);
      res.send(this.getSuccessHtml());
    } catch {
      res.send(this.getFormHtml(token, 'Lien invalide ou expiré (valide 1 h). Demandez un nouveau lien.'));
    }
  }

  private getSuccessHtml(): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mot de passe mis à jour – VisionArt</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: #f8fafc; }
    .card { max-width: 400px; text-align: center; background: #1e293b; border-radius: 16px; padding: 32px; }
    h1 { color: #6ee7b7; margin-bottom: 16px; }
    p { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Mot de passe mis à jour</h1>
    <p>Vous pouvez fermer cette page et vous connecter dans l'app VisionArt avec votre nouveau mot de passe.</p>
  </div>
</body>
</html>`;
  }

  private getFormHtml(token: string, errorMessage: string): string {
    const errorBlock = errorMessage
      ? `<div class="msg error" role="alert">${escapeHtml(errorMessage)}</div>`
      : '';
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Réinitialiser le mot de passe – VisionArt</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: #f8fafc; }
    .card { max-width: 400px; width: 100%; background: #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    .sub { color: #94a3b8; font-size: 0.9rem; margin-bottom: 24px; }
    label { display: block; margin-bottom: 6px; font-size: 0.9rem; }
    input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #f8fafc; font-size: 1rem; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #7c3aed; }
    button { width: 100%; padding: 14px; border: none; border-radius: 8px; background: linear-gradient(135deg, #7c3aed, #3b82f6); color: white; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { opacity: 0.95; }
    .msg.error { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 0.9rem; background: #7f1d1d; color: #fca5a5; }
    .no-token { color: #f87171; font-size: 0.9rem; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Réinitialiser le mot de passe</h1>
    <p class="sub">Choisissez un nouveau mot de passe pour votre compte VisionArt.</p>
    ${errorBlock}
    <form method="post" action="/reset-password">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <label for="password">Nouveau mot de passe (min. 6 caractères)</label>
      <input type="password" id="password" name="newPassword" minlength="6" placeholder="••••••••" autocomplete="new-password" required>
      <label for="confirm">Confirmer le mot de passe</label>
      <input type="password" id="confirm" name="confirm" minlength="6" placeholder="••••••••" autocomplete="new-password" required>
      <button type="submit">Réinitialiser</button>
    </form>
    ${!token ? '<p class="no-token">Lien invalide : token manquant. Utilisez le lien reçu par email.</p>' : ''}
  </div>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
