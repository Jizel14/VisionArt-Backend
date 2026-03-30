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
  CreateListingDto,
  ListListingsDto,
  ReconcileTransactionDto,
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
    return this.marketplaceService.buyListing(userId, listingId, dto.txHash);
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
