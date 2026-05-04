import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../ai-moderation/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RetentionService } from './retention.service';
import { RetentionEventType } from './entities/retention-event.entity';

const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Controller('retention')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  // ── Public tracking endpoints (no auth) ──────────────────────────────────

  @Get('track/open/:actionId.gif')
  async trackOpen(
    @Param('actionId') actionId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.retention
      .trackEvent(actionId, RetentionEventType.OPENED, {
        userAgent: res.req.headers['user-agent'],
      })
      .catch(() => {});
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.send(PIXEL_GIF);
  }

  @Get('track/click/:actionId')
  async trackClick(
    @Param('actionId') actionId: string,
    @Query('to') to: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.retention
      .trackEvent(actionId, RetentionEventType.CLICKED, { to })
      .catch(() => {});
    const safe = (to || '').startsWith('http') ? to : '/';
    res.redirect(302, safe);
  }

  @Get('unsubscribe')
  async unsubscribe(
    @Query('u') userId: string,
    @Query('t') actionId: string,
    @Res() res: Response,
  ): Promise<void> {
    if (userId) {
      await this.retention.unsubscribeUser(userId).catch(() => {});
      if (actionId) {
        await this.retention
          .trackEvent(actionId, RetentionEventType.UNSUBSCRIBED)
          .catch(() => {});
      }
    }
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:48px"><h2>Désinscription confirmée</h2><p>Tu ne recevras plus d'emails marketing de VisionArt.</p></body></html>`,
      );
  }

  // ── Admin endpoints ─────────────────────────────────────────────────────

  @Get('admin/kpis')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getKpis() {
    return this.retention.getKpis();
  }

  @Get('admin/runs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getRuns(@Query('limit') limit?: string) {
    return this.retention.getRecentRuns(Math.min(100, Number(limit) || 30));
  }

  @Post('admin/run')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async triggerRun(
    @CurrentUser() adminId: string,
    @Body() body: { dryRun?: boolean } = {},
  ) {
    return this.retention.runOnce({
      trigger: `admin-manual:${adminId}`,
      dryRun: !!body.dryRun,
    });
  }

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async listPending(@Query('limit') limit?: string) {
    const items = await this.retention.listPendingReview(
      Math.min(200, Number(limit) || 50),
    );
    return items.map((a) => ({
      id: a.id,
      userId: a.userId,
      userEmail: a.user?.email,
      userName: a.user?.name,
      segment: a.segment,
      channel: a.channel,
      payload: a.payload,
      context: a.context,
      promoCode: a.promoCode,
      createdAt: a.createdAt,
      requiresReview: a.requiresReview,
    }));
  }

  @Post('admin/actions/:id/approve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async approve(
    @Param('id') id: string,
    @CurrentUser() adminId: string,
  ) {
    return this.retention.approveAction(id, adminId);
  }

  @Post('admin/actions/:id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async reject(
    @Param('id') id: string,
    @CurrentUser() adminId: string,
    @Body() body: { reason?: string } = {},
  ) {
    return this.retention.rejectAction(id, adminId, body.reason);
  }

  @Post('admin/actions/:id/edit')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async edit(
    @Param('id') id: string,
    @CurrentUser() adminId: string,
    @Body() body: { subject?: string; body?: string; cta_label?: string },
  ) {
    return this.retention.editPayload(id, adminId, body);
  }
}
