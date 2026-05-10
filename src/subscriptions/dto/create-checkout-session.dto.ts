import { ApiProperty } from '@nestjs/swagger';

export class CreateCheckoutSessionDto {
  // No body needed – plan and user come from JWT and env config
}

export class CheckoutSessionResponseDto {
  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  checkoutUrl: string;
}
