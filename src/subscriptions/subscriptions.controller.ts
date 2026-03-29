import {
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  @ApiOkResponse({ description: 'Current subscription details' })
  async getMySubscription(@Req() req: any) {
    const sub = await this.subscriptionsService.getOrCreateSubscription(
      req.user.userId,
    );
    return this.subscriptionsService.getSubscriptionMeta(sub);
  }

  @Post('create-checkout-session')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Stripe Checkout session URL' })
  async createCheckoutSession(@Req() req: any) {
    return this.subscriptionsService.createCheckoutSession(
      req.user.userId,
      req.user.email,
    );
  }

  @Post('cancel')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Subscription canceled at period end' })
  @ApiForbiddenResponse({ description: 'No active subscription' })
  async cancelSubscription(@Req() req: any) {
    return this.subscriptionsService.cancelSubscription(req.user.userId);
  }
}
