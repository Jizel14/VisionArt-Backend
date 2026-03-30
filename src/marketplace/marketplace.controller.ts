import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import {
  VerifyTransactionParamsDto,
  WalletAddressParamsDto,
} from './dto/wallet-balance.dto';
import {
  BuyListingDto,
  ConnectWalletDto,
  CreateNegotiationRequestDto,
  CreateListingDto,
  ListListingsDto,
  ListNegotiationsDto,
  ReconcileTransactionDto,
  RespondNegotiationDto,
  SendNegotiationMessageDto,
  WalletAmountDto,
  WithdrawDto,
} from './dto/marketplace.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('marketplace')
@UseGuards(JwtAuthGuard)
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('config')
  getConfig() {
    return this.marketplaceService.getConfig();
  }

  @Get('blockchain/proof')
  getBlockchainProof() {
    return this.marketplaceService.getBlockchainProof();
  }

  @Get('wallet/me')
  async getMyWallet(@CurrentUser() userId: string) {
    return this.marketplaceService.getMyWallet(userId);
  }

  @Post('wallet/connect')
  async connectWallet(
    @CurrentUser() userId: string,
    @Body() dto: ConnectWalletDto,
  ) {
    return this.marketplaceService.connectWallet(userId, dto.walletAddress);
  }

  @Post('wallet/topup')
  async topup(@CurrentUser() userId: string, @Body() dto: WalletAmountDto) {
    return this.marketplaceService.topup(
      userId,
      dto.amount,
      dto.reference,
      dto.txHash,
    );
  }

  @Post('wallet/withdraw')
  async withdraw(@CurrentUser() userId: string, @Body() dto: WithdrawDto) {
    return this.marketplaceService.withdraw(
      userId,
      dto.amount,
      dto.destinationAddress,
      dto.reference,
      dto.txHash,
      dto.tokenType,
    );
  }

  @Get('listings')
  async listListings(
    @CurrentUser() userId: string,
    @Query() query: ListListingsDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const status = query.status || 'active';
    return this.marketplaceService.listListings(userId, page, limit, status);
  }

  @Get('my/listings')
  async listMyListings(
    @CurrentUser() userId: string,
    @Query() query: ListListingsDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    return this.marketplaceService.listMyListings(userId, page, limit);
  }

  @Post('listings')
  async createListing(
    @CurrentUser() userId: string,
    @Body() dto: CreateListingDto,
  ) {
    return this.marketplaceService.createListing(userId, dto);
  }

  @Post('listings/:listingId/cancel')
  async cancelListing(
    @CurrentUser() userId: string,
    @Param('listingId') listingId: string,
  ) {
    return this.marketplaceService.cancelListing(userId, listingId);
  }

  @Post('listings/:listingId/buy')
  async buyListing(
    @CurrentUser() userId: string,
    @Param('listingId') listingId: string,
    @Body() dto: BuyListingDto,
  ) {
    return this.marketplaceService.buyListing(
      userId,
      listingId,
      dto.negotiationId,
      dto.txHash,
    );
  }

  @Post('negotiations/request')
  async createNegotiationRequest(
    @CurrentUser() userId: string,
    @Body() dto: CreateNegotiationRequestDto,
  ) {
    return this.marketplaceService.createNegotiationRequest(userId, dto);
  }

  @Post('negotiations/:negotiationId/respond')
  async respondNegotiation(
    @CurrentUser() userId: string,
    @Param('negotiationId') negotiationId: string,
    @Body() dto: RespondNegotiationDto,
  ) {
    return this.marketplaceService.respondNegotiation(
      userId,
      negotiationId,
      dto.action,
      dto.message,
    );
  }

  @Get('negotiations')
  async listMyNegotiations(
    @CurrentUser() userId: string,
    @Query() query: ListNegotiationsDto,
  ) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const status = query.status || 'all';
    return this.marketplaceService.listMyNegotiations(
      userId,
      page,
      limit,
      status,
    );
  }

  @Get('negotiations/:negotiationId/messages')
  async listNegotiationMessages(
    @CurrentUser() userId: string,
    @Param('negotiationId') negotiationId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketplaceService.listNegotiationMessages(
      userId,
      negotiationId,
      Number(page || 1),
      Math.min(Number(limit || 50), 100),
    );
  }

  @Post('negotiations/:negotiationId/messages')
  async sendNegotiationMessage(
    @CurrentUser() userId: string,
    @Param('negotiationId') negotiationId: string,
    @Body() dto: SendNegotiationMessageDto,
  ) {
    return this.marketplaceService.sendNegotiationMessage(
      userId,
      negotiationId,
      dto,
    );
  }

  @Get('wallet/:address/balance')
  async getWalletBalance(@Param() params: WalletAddressParamsDto) {
    return this.marketplaceService.getWalletBalances(params.address);
  }

  @Get('transactions/:txHash/verify')
  async verifyTransaction(@Param() params: VerifyTransactionParamsDto) {
    return this.marketplaceService.verifyTransaction(params.txHash);
  }

  @Post('transactions/reconcile')
  async reconcileTransaction(
    @CurrentUser() userId: string,
    @Body() dto: ReconcileTransactionDto,
  ) {
    const result = await this.marketplaceService.reconcileTransaction(
      userId,
      dto.txHash,
    );
    return result;
  }
}
