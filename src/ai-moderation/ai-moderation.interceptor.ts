import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { AiModerationService } from './ai-moderation.service';
import { ModerationStatus } from './ai-moderation.constants';

@Injectable()
export class AiModerationInterceptor implements NestInterceptor {
  constructor(private readonly moderationService: AiModerationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const body = request['body'] as Record<string, unknown> | undefined;

    // Collect all text fields present in the body (artwork: title+description, comment: content)
    const text = ['title', 'description', 'content']
      .map((k) => (typeof body?.[k] === 'string' ? (body[k] as string).trim() : ''))
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!text) return next.handle();

    return from(this.moderationService.moderate(text)).pipe(
      switchMap((result) => {
        // If the moderation model flags the content, block the request and
        // show a clear message to the user. (Previously only medium/high
        // blocked, which let low-severity cases like profanity through.)
        if (result.flagged) {
          const reason = result.reason?.trim();
          throw new BadRequestException(
            reason != null && reason.length > 0
              ? `Your content was flagged for inappropriate content. ${reason}`
              : 'Your content was flagged for inappropriate content. Please review and revise.',
          );
        }

        // Attach moderation result to request for the controller to read
        request['moderationStatus'] = result.flagged
          ? ModerationStatus.PENDING_REVIEW
          : ModerationStatus.APPROVED;
        request['moderationReason'] = result.reason;

        return next.handle();
      }),
    );
  }
}
