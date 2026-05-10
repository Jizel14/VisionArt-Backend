import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { LoyaltyService, REDEMPTION_TIERS } from './loyalty.service';

class RedeemDto {
  points!: number;
}

@Controller('loyalty')
@UseGuards(JwtAuthGuard)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('me')
  async getMyBalance(@CurrentUser() userId: string) {
    const balance = await this.loyalty.getBalance(userId);
    const events = await this.loyalty.listEvents(userId, 20);
    return {
      balance,
      tiers: REDEMPTION_TIERS,
      recentEvents: events.map((e) => ({
        id: e.id,
        type: e.type,
        delta: e.delta,
        createdAt: e.createdAt,
      })),
    };
  }

  @Post('redeem')
  async redeem(
    @CurrentUser() userId: string,
    @Body() dto: RedeemDto,
  ) {
    try {
      return await this.loyalty.redeem(userId, Number(dto.points));
    } catch (e) {
      throw new HttpException(
        (e as Error).message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
