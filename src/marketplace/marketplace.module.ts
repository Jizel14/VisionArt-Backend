import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceWallet } from './entities/marketplace-wallet.entity';
import { MarketplaceWalletTransaction } from './entities/marketplace-wallet-transaction.entity';
import { MarketplaceListing } from './entities/marketplace-listing.entity';
import { MarketplaceNegotiation } from './entities/marketplace-negotiation.entity';
import { MarketplaceNegotiationMessage } from './entities/marketplace-negotiation-message.entity';
import { Artwork } from '../social/artworks/entities/artwork.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketplaceWallet,
      MarketplaceWalletTransaction,
      MarketplaceListing,
      MarketplaceNegotiation,
      MarketplaceNegotiationMessage,
      Artwork,
      User,
    ]),
  ],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
