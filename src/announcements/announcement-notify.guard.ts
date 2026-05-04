import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Matches backoffice dev fallback when ANNOUNCEMENT_BROADCAST_SECRET is unset. */
const DEV_ANNOUNCEMENT_BROADCAST_SECRET = 'visionart-dev-announcement-broadcast';

/** Backoffice calls POST /announcements/notify with this header after DB changes. */
@Injectable()
export class AnnouncementNotifyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const fromEnv = this.config.get<string>('ANNOUNCEMENT_BROADCAST_SECRET')?.trim();
    const secret =
      fromEnv ||
      (process.env.NODE_ENV !== 'production'
        ? DEV_ANNOUNCEMENT_BROADCAST_SECRET
        : '');
    if (!secret) {
      throw new UnauthorizedException('ANNOUNCEMENT_BROADCAST_SECRET is not set');
    }
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const raw = req.headers['x-announcement-broadcast-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (key !== secret) {
      throw new UnauthorizedException('Invalid announcement broadcast key');
    }
    return true;
  }
}
