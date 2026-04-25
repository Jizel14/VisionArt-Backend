import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { ethers } from 'ethers';
import { MarketplaceWallet } from './entities/marketplace-wallet.entity';
import { MarketplaceWalletTransaction } from './entities/marketplace-wallet-transaction.entity';
import { MarketplaceListing } from './entities/marketplace-listing.entity';
import { MarketplaceNegotiation } from './entities/marketplace-negotiation.entity';
import { MarketplaceNegotiationMessage } from './entities/marketplace-negotiation-message.entity';
import { Artwork } from '../social/artworks/entities/artwork.entity';

// Minimal ERC20 ABI for transfer only
const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const NFT_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenUri', type: 'string' },
    ],
    name: 'mintTo',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'to', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'tokenURI', type: 'string' },
    ],
    name: 'Minted',
    type: 'event',
  },
];

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(MarketplaceWallet)
    private readonly walletRepo: Repository<MarketplaceWallet>,
    @InjectRepository(MarketplaceWalletTransaction)
    private readonly walletTxRepo: Repository<MarketplaceWalletTransaction>,
    @InjectRepository(MarketplaceListing)
    private readonly listingRepo: Repository<MarketplaceListing>,
    @InjectRepository(MarketplaceNegotiation)
    private readonly negotiationRepo: Repository<MarketplaceNegotiation>,
    @InjectRepository(MarketplaceNegotiationMessage)
    private readonly negotiationMessageRepo: Repository<MarketplaceNegotiationMessage>,
    @InjectRepository(Artwork)
    private readonly artworkRepo: Repository<Artwork>,
  ) {}

  private toAmount(value: number | string): number {
    return Number.parseFloat(`${value}`) || 0;
  }

  private amountToStorage(value: number): string {
    return value.toFixed(6);
  }

  private isValidTxHash(txHash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(txHash.trim());
  }

  private get treasuryPrivateKey(): string | null {
    const key = this.configService
      .get<string>('WEB3_TREASURY_PRIVATE_KEY')
      ?.trim();
    return key?.length ? key : null;
  }

  private get treasuryAddress(): string | null {
    const configured = this.configService
      .get<string>('WEB3_TREASURY_WALLET_ADDRESS')
      ?.trim();
    if (configured?.length) {
      return configured.toLowerCase();
    }

    const key = this.treasuryPrivateKey;
    if (!key) {
      return null;
    }

    try {
      return new ethers.Wallet(key).address.toLowerCase();
    } catch {
      return null;
    }
  }

  private get treasurySigner(): ethers.Wallet {
    const key = this.treasuryPrivateKey;
    if (!key) {
      throw new BadRequestException(
        'WEB3_TREASURY_PRIVATE_KEY is not configured',
      );
    }

    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    return new ethers.Wallet(key, provider);
  }

  private get usdcContractAddress(): string | null {
    const configured = this.configService
      .get<string>('WEB3_USDC_CONTRACT_ADDRESS')
      ?.trim();
    return configured?.length ? configured.toLowerCase() : null;
  }

  private get nftContractAddress(): string | null {
    const configured = this.configService
      .get<string>('WEB3_NFT_CONTRACT_ADDRESS')
      ?.trim();
    return configured?.length ? configured.toLowerCase() : null;
  }

  private getErc20Contract(contractAddress: string): ethers.Contract {
    const signer = this.treasurySigner;
    return new ethers.Contract(contractAddress, ERC20_ABI, signer);
  }

  private getNftContract(contractAddress: string): ethers.Contract {
    const signer = this.treasurySigner;
    return new ethers.Contract(contractAddress, NFT_ABI, signer);
  }

  private async sendUsdcTransfer(
    destinationAddress: string,
    amountUnits: bigint,
  ): Promise<string> {
    const usdcAddress = this.usdcContractAddress;
    if (!usdcAddress) {
      throw new BadRequestException(
        'WEB3_USDC_CONTRACT_ADDRESS is not configured',
      );
    }

    const contract = this.getErc20Contract(usdcAddress);
    const tx = await contract.transfer(destinationAddress, amountUnits);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new BadRequestException(
        'USDC transfer transaction failed on-chain',
      );
    }

    return tx.hash;
  }

  private async getOrCreateWallet(userId: string): Promise<MarketplaceWallet> {
    let wallet = await this.walletRepo.findOne({ where: { userId } });

    if (!wallet) {
      wallet = this.walletRepo.create({
        userId,
        availableBalance: '0.000000',
        currency: 'USDC',
        walletAddress: null,
      });
      wallet = await this.walletRepo.save(wallet);
    }

    return wallet;
  }

  async getMyWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const transactions = await this.walletTxRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return {
      wallet: {
        id: wallet.id,
        userId: wallet.userId,
        currency: wallet.currency,
        availableBalance: this.toAmount(wallet.availableBalance),
        walletAddress: wallet.walletAddress,
      },
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: this.toAmount(tx.amount),
        currency: tx.currency,
        reference: tx.reference,
        metadata: tx.metadata,
        createdAt: tx.createdAt,
      })),
    };
  }

  async getSellerAnalytics(userId: string) {
    const [listings, negotiations] = await Promise.all([
      this.listingRepo.find({
        where: { sellerId: userId },
        relations: ['artwork', 'buyer'],
        order: { createdAt: 'DESC' },
      }),
      this.negotiationRepo.find({
        where: { sellerId: userId },
        relations: ['listing', 'listing.artwork', 'requester'],
        order: { updatedAt: 'DESC' },
      }),
    ]);

    const totalListings = listings.length;
    const activeListings = listings.filter(
      (listing) => listing.isActive,
    ).length;
    const soldListings = listings.filter(
      (listing) => listing.status === 'sold',
    ).length;
    const cancelledListings = listings.filter(
      (listing) => listing.status === 'cancelled',
    ).length;
    const negotiableListings = listings.filter(
      (listing) => listing.negotiable,
    ).length;
    const fixedListings = totalListings - negotiableListings;

    const soldRows = listings.filter((listing) => listing.status === 'sold');
    const soldPrices = soldRows.map((listing) => this.toAmount(listing.price));
    const totalSoldRevenue = soldPrices.reduce((sum, value) => sum + value, 0);
    const averageSoldPrice =
      soldPrices.length > 0 ? totalSoldRevenue / soldPrices.length : 0;
    const highestSoldPrice =
      soldPrices.length > 0 ? Math.max(...soldPrices) : 0;

    const totalNegotiations = negotiations.length;
    const pendingNegotiations = negotiations.filter(
      (item) => item.status === 'pending',
    ).length;
    const acceptedNegotiations = negotiations.filter(
      (item) => item.status === 'accepted',
    ).length;
    const deniedNegotiations = negotiations.filter(
      (item) => item.status === 'denied',
    ).length;
    const closedNegotiations = negotiations.filter(
      (item) => item.status === 'closed',
    ).length;
    const negotiationDecisionCount = acceptedNegotiations + deniedNegotiations;
    const negotiationAcceptanceRate =
      negotiationDecisionCount > 0
        ? acceptedNegotiations / negotiationDecisionCount
        : 0;

    const recentSales = soldRows.slice(0, 5).map((listing) => ({
      listingId: listing.id,
      artworkId: listing.artworkId,
      title: listing.artwork?.title ?? 'Untitled artwork',
      imageUrl: listing.artwork?.imageUrl ?? null,
      buyerName: listing.buyer?.name ?? null,
      price: this.toAmount(listing.price),
      currency: listing.currency,
      soldAt: listing.soldAt,
      negotiable: listing.negotiable,
    }));

    return {
      summary: {
        totalListings,
        activeListings,
        soldListings,
        cancelledListings,
        negotiableListings,
        fixedListings,
        totalNegotiations,
        pendingNegotiations,
        acceptedNegotiations,
        deniedNegotiations,
        closedNegotiations,
        totalSoldRevenue,
        averageSoldPrice,
        highestSoldPrice,
        negotiationAcceptanceRate,
      },
      recentSales,
    };
  }

  async mintArtworkNft(
    userId: string,
    payload: { artworkId: string; recipientAddress?: string },
  ) {
    const nftContractAddress = this.nftContractAddress;
    if (!nftContractAddress) {
      throw new BadRequestException(
        'WEB3_NFT_CONTRACT_ADDRESS is not configured',
      );
    }

    const artwork = await this.artworkRepo.findOne({
      where: { id: payload.artworkId },
      relations: ['user', 'remixedFrom', 'remixedFrom.user'],
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    if (artwork.userId !== userId) {
      throw new BadRequestException('Only artwork owner can mint it');
    }

    if (!artwork.isPublic) {
      throw new BadRequestException('Artwork must be public before minting');
    }

    const existingMetadata = this.toRecord(artwork.metadata);
    const existingNft = this.toRecord(existingMetadata.nft);
    if (Object.keys(existingNft).length > 0) {
      throw new BadRequestException('Artwork is already minted as an NFT');
    }

    const wallet = await this.getOrCreateWallet(userId);
    const recipientAddress =
      payload.recipientAddress?.trim() || wallet.walletAddress?.trim() || '';

    if (!recipientAddress) {
      throw new BadRequestException(
        'Connect a wallet or provide a recipient address to mint',
      );
    }

    if (!this.isValidAddress(recipientAddress)) {
      throw new BadRequestException('Invalid recipient address');
    }

    const nftContract = this.getNftContract(nftContractAddress);
    const mintedAt = new Date().toISOString();

    // Create metadata stored off-chain (in DB) and referenced on-chain via compact URI
    const metadata = {
      name: artwork.title?.trim() || 'VisionArt artwork',
      description:
        artwork.description?.trim() || 'A VisionArt artwork minted on-chain.',
      image: artwork.imageUrl,
      external_url: `https://visionart.app/artworks/${artwork.id}`,
      attributes: [
        { trait_type: 'Artist', value: artwork.user?.name ?? 'Unknown artist' },
        { trait_type: 'Artwork ID', value: artwork.id },
        {
          trait_type: 'Visibility',
          value: artwork.isPublic ? 'Public' : 'Private',
        },
      ],
    };

    // Compact on-chain URI to minimize gas — full metadata served via API
    const baseUrl =
      this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000';
    const tokenUri = `${baseUrl}/marketplace/nfts/${artwork.id}/metadata`;

    const tx = await nftContract.mintTo(recipientAddress, tokenUri);
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      throw new BadRequestException('NFT mint transaction failed on-chain');
    }

    const parsedMintEvent = receipt.logs
      .map((log: ethers.Log) => {
        try {
          return nftContract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event) => event?.name === 'Minted');

    const tokenId = parsedMintEvent
      ? parsedMintEvent.args.tokenId.toString()
      : null;

    artwork.metadata = {
      ...existingMetadata,
      nft: {
        contractAddress: nftContractAddress,
        recipientAddress,
        tokenId,
        tokenURI: tokenUri,
        transactionHash: tx.hash,
        mintedAt,
        metadata: metadata,
      },
    };

    const savedArtwork = await this.artworkRepo.save(artwork);
    const refreshedArtwork = await this.artworkRepo.findOne({
      where: { id: savedArtwork.id },
      relations: ['user', 'remixedFrom', 'remixedFrom.user'],
    });

    if (!refreshedArtwork) {
      throw new NotFoundException('Artwork not found after mint');
    }

    const artworkResponse = {
      id: refreshedArtwork.id,
      user: {
        id: refreshedArtwork.user?.id ?? 'unknown',
        name: refreshedArtwork.user?.name ?? 'Unknown User',
        email: refreshedArtwork.user?.email ?? '',
        avatarUrl: refreshedArtwork.user?.avatarUrl ?? null,
        bio: refreshedArtwork.user?.bio ?? null,
        followersCount: refreshedArtwork.user?.followersCount ?? 0,
        followingCount: refreshedArtwork.user?.followingCount ?? 0,
        publicGenerationsCount:
          refreshedArtwork.user?.publicGenerationsCount ?? 0,
        isVerified: refreshedArtwork.user?.isVerified ?? false,
        isPrivateAccount: refreshedArtwork.user?.isPrivateAccount ?? false,
        createdAt: refreshedArtwork.user?.createdAt ?? new Date(),
        updatedAt:
          refreshedArtwork.user?.updatedAt ??
          refreshedArtwork.user?.createdAt ??
          new Date(),
      },
      title: refreshedArtwork.title,
      description: refreshedArtwork.description,
      imageUrl: refreshedArtwork.imageUrl || '',
      thumbnailUrl: refreshedArtwork.thumbnailUrl,
      metadata: refreshedArtwork.metadata,
      likesCount: refreshedArtwork.likesCount || 0,
      commentsCount: refreshedArtwork.commentsCount || 0,
      remixCount: refreshedArtwork.remixCount || 0,
      isLikedByMe: false,
      isSavedByMe: false,
      isFollowedByMe: false,
      isPublic: refreshedArtwork.isPublic,
      isNSFW: refreshedArtwork.isNSFW,
      remixedFrom: refreshedArtwork.remixedFrom
        ? {
            id: refreshedArtwork.remixedFrom.id,
            user: {
              name: refreshedArtwork.remixedFrom.user?.name || 'Unknown',
            },
          }
        : null,
      createdAt: refreshedArtwork.createdAt,
    };

    return {
      success: true,
      artwork: artworkResponse,
      nft: {
        contractAddress: nftContractAddress,
        recipientAddress,
        tokenId,
        tokenURI: tokenUri,
        transactionHash: tx.hash,
        mintedAt,
      },
    };
  }

  async getNftMetadata(artworkId: string) {
    const artwork = await this.artworkRepo.findOne({
      where: { id: artworkId },
      relations: ['user'],
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    const nftMetadata = this.toRecord(this.toRecord(artwork.metadata).nft);
    if (!nftMetadata || !nftMetadata.metadata) {
      throw new NotFoundException('NFT metadata not found');
    }

    // Return the metadata object so MetaMask can parse it
    return nftMetadata.metadata;
  }

  async connectWallet(userId: string, walletAddress: string) {
    const normalized = walletAddress.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
      throw new BadRequestException('Invalid wallet address');
    }

    const wallet = await this.getOrCreateWallet(userId);
    wallet.walletAddress = normalized;

    const saved = await this.walletRepo.save(wallet);

    return {
      walletAddress: saved.walletAddress,
      message: 'Wallet connected',
    };
  }

  async topup(
    userId: string,
    amount: number,
    reference?: string,
    txHash?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    let chainVerification: Record<string, unknown> | null = null;
    let normalizedTxHash: string | null = null;
    if (txHash?.trim().length) {
      if (!this.isValidTxHash(txHash)) {
        throw new BadRequestException('Invalid tx hash');
      }
      normalizedTxHash = txHash.trim();

      const existingTopup = await this.walletTxRepo.findOne({
        where: {
          type: 'topup',
          reference: normalizedTxHash,
        },
      });
      if (existingTopup) {
        throw new BadRequestException(
          'This topup transaction was already credited',
        );
      }

      chainVerification = await this.verifyTransaction(normalizedTxHash);

      if (!(chainVerification.confirmed && chainVerification.success)) {
        throw new BadRequestException(
          'Topup transaction is not confirmed on-chain',
        );
      }

      const wallet = await this.getOrCreateWallet(userId);
      if (!wallet.walletAddress) {
        throw new BadRequestException(
          'Connect your wallet before using on-chain topup',
        );
      }

      const txFrom = `${chainVerification.from ?? ''}`.toLowerCase();
      const txTo = `${chainVerification.to ?? ''}`.toLowerCase();
      const expectedFrom = wallet.walletAddress.toLowerCase();
      const expectedTo = this.treasuryAddress;

      if (!expectedTo) {
        throw new BadRequestException(
          'Treasury wallet is not configured for on-chain topup verification',
        );
      }

      if (txFrom !== expectedFrom) {
        throw new BadRequestException(
          'Topup tx sender does not match connected wallet',
        );
      }

      if (txTo !== expectedTo) {
        throw new BadRequestException(
          'Topup tx recipient does not match treasury wallet',
        );
      }

      const chainValue = Number.parseFloat(`${chainVerification.value ?? '0'}`);
      if (chainValue + 1e-9 < amount) {
        throw new BadRequestException(
          'On-chain tx value is lower than requested topup amount',
        );
      }

      const current = this.toAmount(wallet.availableBalance);
      wallet.availableBalance = this.amountToStorage(current + amount);

      await this.walletRepo.save(wallet);

      const transaction = this.walletTxRepo.create({
        walletId: wallet.id,
        userId,
        type: 'topup',
        status: 'completed',
        amount: this.amountToStorage(amount),
        currency: wallet.currency,
        reference: normalizedTxHash,
        metadata: {
          source: 'onchain-topup',
          txHash: normalizedTxHash,
          chainVerification,
        },
      });
      await this.walletTxRepo.save(transaction);

      return {
        success: true,
        balance: this.toAmount(wallet.availableBalance),
        transactionId: transaction.id,
      };
    }

    const wallet = await this.getOrCreateWallet(userId);
    const current = this.toAmount(wallet.availableBalance);
    wallet.availableBalance = this.amountToStorage(current + amount);

    await this.walletRepo.save(wallet);

    const transaction = this.walletTxRepo.create({
      walletId: wallet.id,
      userId,
      type: 'topup',
      status: 'completed',
      amount: this.amountToStorage(amount),
      currency: wallet.currency,
      reference: reference?.trim() || null,
      metadata: {
        source: 'manual-topup',
        txHash: normalizedTxHash,
        chainVerification,
      },
    });
    await this.walletTxRepo.save(transaction);

    return {
      success: true,
      balance: this.toAmount(wallet.availableBalance),
      transactionId: transaction.id,
    };
  }

  async withdraw(
    userId: string,
    amount: number,
    destinationAddress?: string,
    reference?: string,
    txHash?: string,
    tokenType: string = 'POL',
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    if (!['POL', 'USDC'].includes(tokenType)) {
      throw new BadRequestException('Invalid token type. Use POL or USDC');
    }

    let chainVerification: Record<string, unknown> | null = null;
    let effectiveTxHash = txHash?.trim() || null;

    const normalizedDestination =
      destinationAddress?.trim().toLowerCase() || null;
    if (normalizedDestination && !this.isValidAddress(normalizedDestination)) {
      throw new BadRequestException('Invalid destination wallet address');
    }

    if (!normalizedDestination && !effectiveTxHash) {
      throw new BadRequestException(
        'Destination wallet is required for on-chain withdraw',
      );
    }

    const wallet = await this.getOrCreateWallet(userId);
    const current = this.toAmount(wallet.availableBalance);
    if (current < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    if (normalizedDestination) {
      const signer = this.treasurySigner;
      const signerAddress = signer.address.toLowerCase();

      if (tokenType === 'POL') {
        // Native POL transfer
        const amountUnits = ethers.parseUnits(amount.toFixed(6), 18);
        const treasuryBalance =
          await signer.provider!.getBalance(signerAddress);
        if (treasuryBalance < amountUnits) {
          throw new BadRequestException(
            'Treasury wallet has insufficient on-chain POL for this withdraw',
          );
        }

        const chainTx = await signer.sendTransaction({
          to: normalizedDestination,
          value: amountUnits,
        });
        const receipt = await chainTx.wait();

        if (!receipt || receipt.status !== 1) {
          throw new BadRequestException('Withdraw transaction failed on-chain');
        }

        effectiveTxHash = chainTx.hash;
      } else if (tokenType === 'USDC') {
        // ERC20 USDC transfer (6 decimals)
        const amountUnits = ethers.parseUnits(amount.toFixed(6), 6);

        // Verify USDC contract is deployed
        const usdcAddress = this.usdcContractAddress;
        if (!usdcAddress) {
          throw new BadRequestException(
            'WEB3_USDC_CONTRACT_ADDRESS is not configured',
          );
        }

        const code = await this.rpcCall<string>('eth_getCode', [
          usdcAddress,
          'latest',
        ]);
        if (code === '0x') {
          throw new BadRequestException(
            'USDC contract is not deployed on this chain',
          );
        }

        // Get USDC contract and check balance
        const contract = this.getErc20Contract(usdcAddress);
        const usdcBalance = await contract.balanceOf(signerAddress);
        if (usdcBalance < amountUnits) {
          throw new BadRequestException(
            'Treasury wallet has insufficient on-chain USDC for this withdraw',
          );
        }

        effectiveTxHash = await this.sendUsdcTransfer(
          normalizedDestination,
          amountUnits,
        );
      }

      if (!effectiveTxHash) {
        throw new BadRequestException(
          'Failed to get transaction hash from on-chain transfer',
        );
      }

      chainVerification = await this.verifyTransaction(effectiveTxHash);
    } else if (effectiveTxHash) {
      if (!this.isValidTxHash(effectiveTxHash)) {
        throw new BadRequestException('Invalid tx hash');
      }
      chainVerification = await this.verifyTransaction(effectiveTxHash);
    }

    wallet.availableBalance = this.amountToStorage(current - amount);
    await this.walletRepo.save(wallet);

    const transaction = this.walletTxRepo.create({
      walletId: wallet.id,
      userId,
      type: 'withdraw',
      status: 'completed',
      amount: this.amountToStorage(amount),
      currency: tokenType === 'USDC' ? 'USDC' : 'POL',
      reference: reference?.trim() || null,
      metadata: {
        destinationAddress: normalizedDestination,
        txHash: effectiveTxHash,
        tokenType,
        chainVerification,
      },
    });
    await this.walletTxRepo.save(transaction);

    return {
      success: true,
      balance: this.toAmount(wallet.availableBalance),
      transactionId: transaction.id,
      txHash: effectiveTxHash,
      tokenType,
    };
  }

  async createListing(
    userId: string,
    payload: {
      artworkId: string;
      price: number;
      currency?: string;
      negotiable?: boolean;
      paymentToken?: string;
      txHash?: string;
    },
  ) {
    if (payload.price <= 0) {
      throw new BadRequestException('Price must be greater than 0');
    }

    const artwork = await this.artworkRepo.findOne({
      where: { id: payload.artworkId },
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    if (artwork.userId !== userId) {
      throw new BadRequestException('Only artwork owner can list it');
    }

    if (!artwork.isPublic) {
      throw new BadRequestException('Artwork must be public before listing');
    }

    const existingActive = await this.listingRepo.findOne({
      where: {
        artworkId: payload.artworkId,
        isActive: true,
      },
    });

    if (existingActive) {
      throw new BadRequestException('Artwork already has an active listing');
    }

    let chainVerification: Record<string, unknown> | null = null;
    if (payload.txHash?.trim().length) {
      if (!this.isValidTxHash(payload.txHash)) {
        throw new BadRequestException('Invalid tx hash');
      }
      chainVerification = await this.verifyTransaction(payload.txHash);
    }

    const listing = this.listingRepo.create({
      artworkId: payload.artworkId,
      sellerId: userId,
      buyerId: null,
      price: this.amountToStorage(payload.price),
      currency: payload.currency ?? 'USDC',
      paymentToken: payload.paymentToken ?? null,
      negotiable: payload.negotiable ?? false,
      isActive: true,
      status: chainVerification ? 'listed_onchain' : 'listed',
      txHash: payload.txHash?.trim() || null,
      soldAt: null,
    });

    const saved = await this.listingRepo.save(listing);

    return {
      id: saved.id,
      artworkId: saved.artworkId,
      sellerId: saved.sellerId,
      price: this.toAmount(saved.price),
      currency: saved.currency,
      negotiable: saved.negotiable,
      status: saved.status,
      txHash: saved.txHash,
      chainVerification,
      createdAt: saved.createdAt,
    };
  }

  async cancelListing(userId: string, listingId: string) {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId !== userId) {
      throw new BadRequestException('Only seller can cancel listing');
    }

    if (!listing.isActive) {
      throw new BadRequestException('Listing is not active');
    }

    listing.isActive = false;
    listing.status = 'cancelled';

    await this.listingRepo.save(listing);

    return { success: true };
  }

  async updateListing(
    userId: string,
    listingId: string,
    payload: { price?: number; negotiable?: boolean },
  ) {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId !== userId) {
      throw new BadRequestException('Only seller can edit listing');
    }

    if (
      !listing.isActive ||
      !['listed', 'listed_onchain'].includes(listing.status)
    ) {
      throw new BadRequestException('Only active listed items can be edited');
    }

    const nextPrice = payload.price;
    if (nextPrice != null) {
      if (nextPrice <= 0) {
        throw new BadRequestException('Price must be greater than 0');
      }
      listing.price = this.amountToStorage(nextPrice);
    }

    if (payload.negotiable != null) {
      listing.negotiable = payload.negotiable;
    }

    await this.listingRepo.save(listing);

    const updated = await this.listingRepo.findOne({
      where: { id: listingId },
    });
    if (!updated) {
      throw new NotFoundException('Listing not found after update');
    }

    if (
      payload.negotiable != null &&
      Boolean(updated.negotiable) !== Boolean(payload.negotiable)
    ) {
      throw new BadRequestException('Unable to persist negotiable state');
    }

    return {
      id: updated.id,
      price: this.toAmount(updated.price),
      currency: updated.currency,
      negotiable: updated.negotiable,
      status: updated.status,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt,
    };
  }

  async createNegotiationRequest(
    userId: string,
    payload: { listingId: string; amount: number; message?: string },
  ) {
    if (payload.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const listing = await this.listingRepo.findOne({
      where: { id: payload.listingId },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (!listing.isActive) {
      throw new BadRequestException('Listing is not active');
    }
    if (!listing.negotiable) {
      throw new BadRequestException('Listing is not negotiable');
    }
    if (listing.sellerId === userId) {
      throw new BadRequestException('Seller cannot negotiate with own listing');
    }

    const existingOpen = await this.negotiationRepo.findOne({
      where: {
        listingId: listing.id,
        requesterId: userId,
        status: In(['pending', 'accepted']),
      },
    });
    if (existingOpen) {
      throw new BadRequestException(
        'You already have a pending negotiation for this listing',
      );
    }

    const negotiation = this.negotiationRepo.create({
      listingId: listing.id,
      requesterId: userId,
      sellerId: listing.sellerId,
      status: 'pending',
      initialAmount: this.amountToStorage(payload.amount),
      latestAmount: this.amountToStorage(payload.amount),
      currency: listing.currency,
      initialMessage: payload.message?.trim() || null,
      acceptedAt: null,
      closedAt: null,
    });
    const saved = await this.negotiationRepo.save(negotiation);

    const initialMessage = this.negotiationMessageRepo.create({
      negotiationId: saved.id,
      senderId: userId,
      type: 'offer',
      message: payload.message?.trim() || null,
      offerAmount: this.amountToStorage(payload.amount),
    });
    await this.negotiationMessageRepo.save(initialMessage);

    return {
      id: saved.id,
      listingId: saved.listingId,
      requesterId: saved.requesterId,
      sellerId: saved.sellerId,
      status: saved.status,
      initialAmount: this.toAmount(saved.initialAmount),
      latestAmount: this.toAmount(saved.latestAmount ?? saved.initialAmount),
      currency: saved.currency,
      initialMessage: saved.initialMessage,
      createdAt: saved.createdAt,
    };
  }

  async respondNegotiation(
    userId: string,
    negotiationId: string,
    action: 'accept' | 'deny',
    message?: string,
  ) {
    const negotiation = await this.negotiationRepo.findOne({
      where: { id: negotiationId },
    });
    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }
    if (negotiation.sellerId !== userId) {
      throw new BadRequestException(
        'Only seller can accept or deny negotiation',
      );
    }
    if (negotiation.status !== 'pending') {
      throw new BadRequestException('Negotiation is no longer pending');
    }

    if (action === 'accept') {
      negotiation.status = 'accepted';
      negotiation.acceptedAt = new Date();
    } else {
      negotiation.status = 'denied';
      negotiation.closedAt = new Date();
    }
    await this.negotiationRepo.save(negotiation);

    if (message?.trim().length) {
      const decisionMessage = this.negotiationMessageRepo.create({
        negotiationId: negotiation.id,
        senderId: userId,
        type: 'message',
        message: message.trim(),
        offerAmount: null,
      });
      await this.negotiationMessageRepo.save(decisionMessage);
    }

    return {
      id: negotiation.id,
      status: negotiation.status,
      acceptedAt: negotiation.acceptedAt,
      closedAt: negotiation.closedAt,
      messagingOpen: negotiation.status === 'accepted',
    };
  }

  async sendNegotiationMessage(
    userId: string,
    negotiationId: string,
    payload: { message?: string; offerAmount?: number },
  ) {
    const hasMessage = !!payload.message?.trim().length;
    const hasOffer = typeof payload.offerAmount === 'number';
    if (!hasMessage && !hasOffer) {
      throw new BadRequestException('Provide message and/or offer amount');
    }

    const negotiation = await this.negotiationRepo.findOne({
      where: { id: negotiationId },
    });
    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }
    if (![negotiation.requesterId, negotiation.sellerId].includes(userId)) {
      throw new BadRequestException('You are not part of this negotiation');
    }
    if (negotiation.status !== 'accepted') {
      throw new BadRequestException(
        'Messaging opens only after negotiation is accepted',
      );
    }

    let messageType = 'message';
    let offerAmount: string | null = null;
    if (hasOffer) {
      const numericOffer = Number(payload.offerAmount);
      if (!Number.isFinite(numericOffer) || numericOffer <= 0) {
        throw new BadRequestException('Offer amount must be greater than 0');
      }
      offerAmount = this.amountToStorage(numericOffer);
      negotiation.latestAmount = offerAmount;
      await this.negotiationRepo.save(negotiation);
      messageType = 'offer';
    }

    const message = this.negotiationMessageRepo.create({
      negotiationId: negotiation.id,
      senderId: userId,
      type: messageType,
      message: payload.message?.trim() || null,
      offerAmount,
    });
    const saved = await this.negotiationMessageRepo.save(message);

    return {
      id: saved.id,
      negotiationId: saved.negotiationId,
      senderId: saved.senderId,
      type: saved.type,
      message: saved.message,
      offerAmount: saved.offerAmount ? this.toAmount(saved.offerAmount) : null,
      createdAt: saved.createdAt,
      currentNegotiatedAmount: negotiation.latestAmount
        ? this.toAmount(negotiation.latestAmount)
        : null,
    };
  }

  async listNegotiationMessages(
    userId: string,
    negotiationId: string,
    page = 1,
    limit = 50,
  ) {
    const negotiation = await this.negotiationRepo.findOne({
      where: { id: negotiationId },
    });
    if (!negotiation) {
      throw new NotFoundException('Negotiation not found');
    }
    if (![negotiation.requesterId, negotiation.sellerId].includes(userId)) {
      throw new BadRequestException('You are not part of this negotiation');
    }

    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const [rows, total] = await this.negotiationMessageRepo.findAndCount({
      where: { negotiationId },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      negotiation: {
        id: negotiation.id,
        listingId: negotiation.listingId,
        status: negotiation.status,
        latestAmount: negotiation.latestAmount
          ? this.toAmount(negotiation.latestAmount)
          : this.toAmount(negotiation.initialAmount),
        currency: negotiation.currency,
      },
      data: rows.map((row) => ({
        id: row.id,
        senderId: row.senderId,
        sender: row.sender
          ? {
              id: row.sender.id,
              name: row.sender.name,
              avatarUrl: row.sender.avatarUrl,
            }
          : null,
        type: row.type,
        message: row.message,
        offerAmount: row.offerAmount ? this.toAmount(row.offerAmount) : null,
        createdAt: row.createdAt,
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async listMyNegotiations(
    userId: string,
    page = 1,
    limit = 20,
    status = 'all',
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const query = this.negotiationRepo
      .createQueryBuilder('negotiation')
      .leftJoinAndSelect('negotiation.listing', 'listing')
      .leftJoinAndSelect('listing.artwork', 'artwork')
      .leftJoinAndSelect('negotiation.requester', 'requester')
      .leftJoinAndSelect('negotiation.seller', 'seller')
      .where(
        'negotiation.requesterId = :userId OR negotiation.sellerId = :userId',
        {
          userId,
        },
      )
      .orderBy('negotiation.updatedAt', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit);

    if (status !== 'all') {
      query.andWhere('negotiation.status = :status', { status });
    }

    const [rows, total] = await query.getManyAndCount();

    return {
      data: rows.map((row) => ({
        id: row.id,
        listingId: row.listingId,
        status: row.status,
        initialAmount: this.toAmount(row.initialAmount),
        latestAmount: this.toAmount(row.latestAmount ?? row.initialAmount),
        currency: row.currency,
        messagingOpen: row.status === 'accepted',
        isRequester: row.requesterId === userId,
        requester: row.requester
          ? {
              id: row.requester.id,
              name: row.requester.name,
              avatarUrl: row.requester.avatarUrl,
            }
          : null,
        seller: row.seller
          ? {
              id: row.seller.id,
              name: row.seller.name,
              avatarUrl: row.seller.avatarUrl,
            }
          : null,
        listing: row.listing
          ? {
              id: row.listing.id,
              price: this.toAmount(row.listing.price),
              currency: row.listing.currency,
              isActive: row.listing.isActive,
              artwork: row.listing.artwork
                ? {
                    id: row.listing.artwork.id,
                    title: row.listing.artwork.title,
                    imageUrl: row.listing.artwork.imageUrl,
                    metadata: row.listing.artwork.metadata,
                  }
                : null,
            }
          : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async buyListing(
    userId: string,
    listingId: string,
    negotiationId?: string,
    txHash?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const listingRepo = manager.getRepository(MarketplaceListing);
      const walletRepo = manager.getRepository(MarketplaceWallet);
      const walletTxRepo = manager.getRepository(MarketplaceWalletTransaction);
      const negotiationRepo = manager.getRepository(MarketplaceNegotiation);
      const artworkRepo = manager.getRepository(Artwork);

      const listing = await listingRepo.findOne({ where: { id: listingId } });
      if (!listing) {
        throw new NotFoundException('Listing not found');
      }

      if (
        !listing.isActive ||
        !['listed', 'listed_onchain'].includes(listing.status)
      ) {
        throw new BadRequestException('Listing is not active');
      }

      if (listing.sellerId === userId) {
        throw new BadRequestException('You cannot buy your own listing');
      }

      const artwork = await artworkRepo.findOne({
        where: { id: listing.artworkId },
      });
      if (!artwork) {
        throw new NotFoundException('Artwork not found for listing');
      }

      if (artwork.userId !== listing.sellerId) {
        throw new BadRequestException(
          'Listing seller no longer owns this artwork',
        );
      }

      let chainVerification: Record<string, unknown> | null = null;
      if (txHash?.trim().length) {
        if (!this.isValidTxHash(txHash)) {
          throw new BadRequestException('Invalid tx hash');
        }
        chainVerification = await this.verifyTransaction(txHash);
      }

      const buyerWallet =
        (await walletRepo.findOne({ where: { userId } })) ||
        walletRepo.create({
          userId,
          availableBalance: '0.000000',
          currency: listing.currency,
          walletAddress: null,
        });

      const sellerWallet =
        (await walletRepo.findOne({ where: { userId: listing.sellerId } })) ||
        walletRepo.create({
          userId: listing.sellerId,
          availableBalance: '0.000000',
          currency: listing.currency,
          walletAddress: null,
        });

      let price = this.toAmount(listing.price);
      if (negotiationId?.trim().length) {
        const negotiation = await negotiationRepo.findOne({
          where: { id: negotiationId.trim() },
        });
        if (!negotiation) {
          throw new NotFoundException('Negotiation not found');
        }
        if (negotiation.listingId !== listing.id) {
          throw new BadRequestException(
            'Negotiation does not belong to listing',
          );
        }
        if (negotiation.status !== 'accepted') {
          throw new BadRequestException(
            'Negotiation must be accepted before buying',
          );
        }
        if (negotiation.requesterId !== userId) {
          throw new BadRequestException(
            'Negotiated price is available only to the approved buyer',
          );
        }
        if (negotiation.sellerId !== listing.sellerId) {
          throw new BadRequestException('Negotiation seller mismatch');
        }

        price = this.toAmount(
          negotiation.latestAmount ?? negotiation.initialAmount,
        );

        negotiation.status = 'closed';
        negotiation.closedAt = new Date();
        await negotiationRepo.save(negotiation);

        await negotiationRepo
          .createQueryBuilder()
          .update(MarketplaceNegotiation)
          .set({ status: 'closed', closedAt: new Date() })
          .where('listing_id = :listingId', { listingId: listing.id })
          .andWhere('status IN (:...statuses)', {
            statuses: ['pending', 'accepted'],
          })
          .andWhere('id != :currentId', { currentId: negotiation.id })
          .execute();
      }

      const buyerBalance = this.toAmount(buyerWallet.availableBalance);
      const sellerBalance = this.toAmount(sellerWallet.availableBalance);

      if (buyerBalance < price) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      buyerWallet.availableBalance = this.amountToStorage(buyerBalance - price);
      sellerWallet.availableBalance = this.amountToStorage(
        sellerBalance + price,
      );

      await walletRepo.save(buyerWallet);
      await walletRepo.save(sellerWallet);

      listing.isActive = false;
      listing.status = 'sold';
      listing.buyerId = userId;
      listing.price = this.amountToStorage(price);
      listing.soldAt = new Date();
      if (txHash?.trim().length) {
        listing.txHash = txHash.trim();
      }

      await listingRepo.save(listing);

      // Transfer artwork ownership in DB after payment.
      artwork.userId = userId;

      // If the artwork has NFT metadata, update the recipientAddress to the buyer
      const existingMetadata = this.toRecord(artwork.metadata);
      const existingNft = this.toRecord(existingMetadata.nft);
      if (Object.keys(existingNft).length > 0) {
        const buyerWalletForNft = await walletRepo.findOne({
          where: { userId },
        });
        artwork.metadata = {
          ...existingMetadata,
          nft: {
            ...existingNft,
            recipientAddress:
              buyerWalletForNft?.walletAddress?.trim() ||
              existingNft.recipientAddress,
            soldTo: userId,
            soldAt: new Date().toISOString(),
          },
        };
      }

      await artworkRepo.save(artwork);

      const buyerTx = walletTxRepo.create({
        walletId: buyerWallet.id,
        userId,
        type: 'purchase',
        status: 'completed',
        amount: this.amountToStorage(price),
        currency: listing.currency,
        reference: listing.id,
        metadata: {
          listingId: listing.id,
          negotiationId: negotiationId?.trim() || null,
          counterpartyUserId: listing.sellerId,
          txHash: txHash?.trim() || null,
          chainVerification,
        },
      });

      const sellerTx = walletTxRepo.create({
        walletId: sellerWallet.id,
        userId: listing.sellerId,
        type: 'sale',
        status: 'completed',
        amount: this.amountToStorage(price),
        currency: listing.currency,
        reference: listing.id,
        metadata: {
          listingId: listing.id,
          negotiationId: negotiationId?.trim() || null,
          counterpartyUserId: userId,
          txHash: txHash?.trim() || null,
          chainVerification,
        },
      });

      await walletTxRepo.save(buyerTx);
      await walletTxRepo.save(sellerTx);

      return {
        success: true,
        listingId: listing.id,
        artworkId: listing.artworkId,
        newOwnerId: userId,
        status: listing.status,
        negotiated: !!negotiationId,
        finalPrice: price,
        txHash: listing.txHash,
        chainVerification,
        buyerBalance: this.toAmount(buyerWallet.availableBalance),
      };
    });
  }

  async listListings(userId: string, page = 1, limit = 20, status = 'active') {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const query = this.listingRepo
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.artwork', 'artwork')
      .leftJoinAndSelect('listing.seller', 'seller')
      .orderBy('listing.createdAt', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit);

    if (status === 'active') {
      query.andWhere('listing.isActive = true');
    } else if (status === 'sold') {
      query.andWhere('listing.status = :status', { status: 'sold' });
    } else if (status === 'cancelled') {
      query.andWhere('listing.status = :status', { status: 'cancelled' });
    }

    const [rows, total] = await query.getManyAndCount();

    return {
      data: rows.map((listing) => ({
        id: listing.id,
        artworkId: listing.artworkId,
        sellerId: listing.sellerId,
        buyerId: listing.buyerId,
        price: this.toAmount(listing.price),
        currency: listing.currency,
        negotiable: listing.negotiable,
        status: listing.status,
        isActive: listing.isActive,
        isMine: listing.sellerId === userId,
        artwork: listing.artwork
          ? {
              id: listing.artwork.id,
              title: listing.artwork.title,
              imageUrl: listing.artwork.imageUrl,
              description: listing.artwork.description,
              likesCount: listing.artwork.likesCount,
              commentsCount: listing.artwork.commentsCount,
              metadata: listing.artwork.metadata,
            }
          : null,
        seller: listing.seller
          ? {
              id: listing.seller.id,
              name: listing.seller.name,
              avatarUrl: listing.seller.avatarUrl,
            }
          : null,
        createdAt: listing.createdAt,
        soldAt: listing.soldAt,
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async listMyListings(
    userId: string,
    page = 1,
    limit = 20,
    role: 'seller' | 'buyer' | 'all' = 'seller',
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const where =
      role === 'buyer'
        ? { buyerId: userId }
        : role === 'all'
          ? [{ sellerId: userId }, { buyerId: userId }]
          : { sellerId: userId };

    const [rows, total] = await this.listingRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      relations: ['artwork', 'seller'],
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    const purchasedListingIds = rows
      .filter((listing) => listing.buyerId === userId)
      .map((listing) => listing.id);

    const paidAmountByListingId = new Map<string, number>();
    if (purchasedListingIds.length > 0) {
      const purchaseTxs = await this.walletTxRepo.find({
        where: {
          userId,
          type: 'purchase',
          reference: In(purchasedListingIds),
        },
        order: { createdAt: 'DESC' },
      });

      for (const tx of purchaseTxs) {
        if (!tx.reference) continue;
        if (paidAmountByListingId.has(tx.reference)) continue;
        paidAmountByListingId.set(tx.reference, this.toAmount(tx.amount));
      }
    }

    return {
      data: rows.map((listing) => ({
        id: listing.id,
        artworkId: listing.artworkId,
        sellerId: listing.sellerId,
        buyerId: listing.buyerId,
        price:
          paidAmountByListingId.get(listing.id) ?? this.toAmount(listing.price),
        currency: listing.currency,
        status: listing.status,
        isActive: listing.isActive,
        isMine: listing.sellerId === userId,
        artwork: listing.artwork
          ? {
              id: listing.artwork.id,
              title: listing.artwork.title,
              imageUrl: listing.artwork.imageUrl,
              metadata: listing.artwork.metadata,
            }
          : null,
        seller: listing.seller
          ? {
              id: listing.seller.id,
              name: listing.seller.name,
              avatarUrl: listing.seller.avatarUrl,
            }
          : null,
        createdAt: listing.createdAt,
        soldAt: listing.soldAt,
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  // Existing chain read helpers
  private get rpcUrl(): string {
    const rpcUrl = this.configService.get<string>('WEB3_RPC_URL');
    if (!rpcUrl) {
      throw new BadRequestException('WEB3_RPC_URL is not configured');
    }
    return rpcUrl;
  }

  private async rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(
        `RPC request failed with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      result?: T;
      error?: { message?: string };
    };

    if (payload.error) {
      throw new BadRequestException(payload.error.message ?? 'RPC error');
    }

    return payload.result as T;
  }

  private isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  private formatWeiToEth(weiHex: string): string {
    const wei = BigInt(weiHex);
    const divisor = 10n ** 18n;
    const whole = wei / divisor;
    const fraction = wei % divisor;
    const fractionStr = fraction
      .toString()
      .padStart(18, '0')
      .replace(/0+$/, '');
    return fractionStr.length > 0
      ? `${whole.toString()}.${fractionStr}`
      : whole.toString();
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  getConfig() {
    return {
      chainId: Number(
        this.configService.get<string>('WEB3_CHAIN_ID') ?? '80002',
      ),
      chainName:
        this.configService.get<string>('WEB3_CHAIN_NAME') ?? 'Polygon Amoy',
      nativeSymbol:
        this.configService.get<string>('WEB3_NATIVE_SYMBOL') ?? 'POL',
      marketplaceContractAddress:
        this.configService.get<string>('WEB3_MARKETPLACE_CONTRACT_ADDRESS') ??
        '',
      nftContractAddress:
        this.configService.get<string>('WEB3_NFT_CONTRACT_ADDRESS') ?? '',
      usdcContractAddress:
        this.configService.get<string>('WEB3_USDC_CONTRACT_ADDRESS') ?? '',
      treasuryAddress: this.treasuryAddress ?? '',
    };
  }

  async getBlockchainProof() {
    const config = this.getConfig();

    const [rawChainId, rawBlockNumber] = await Promise.all([
      this.rpcCall<string>('eth_chainId', []),
      this.rpcCall<string>('eth_blockNumber', []),
    ]);

    const chainId = Number.parseInt(rawChainId, 16);
    const latestBlockNumber = Number.parseInt(rawBlockNumber, 16);

    const contractCandidates = [
      {
        label: 'marketplace',
        address: config.marketplaceContractAddress,
      },
      {
        label: 'nft',
        address: config.nftContractAddress,
      },
      {
        label: 'usdc',
        address: config.usdcContractAddress,
      },
    ];

    const contracts = await Promise.all(
      contractCandidates.map(async (item) => {
        const normalizedAddress = (item.address || '').trim();

        if (!normalizedAddress) {
          return {
            label: item.label,
            address: '',
            configured: false,
            validAddress: false,
            deployed: false,
            codeSize: 0,
          };
        }

        const validAddress = this.isValidAddress(normalizedAddress);
        if (!validAddress) {
          return {
            label: item.label,
            address: normalizedAddress,
            configured: true,
            validAddress: false,
            deployed: false,
            codeSize: 0,
          };
        }

        const code = await this.rpcCall<string>('eth_getCode', [
          normalizedAddress,
          'latest',
        ]);
        const normalizedCode = (code || '').toLowerCase();
        const deployed = normalizedCode !== '0x' && normalizedCode.length > 2;

        return {
          label: item.label,
          address: normalizedAddress,
          configured: true,
          validAddress: true,
          deployed,
          codeSize: deployed ? Math.max((normalizedCode.length - 2) / 2, 0) : 0,
        };
      }),
    );

    return {
      chain: {
        expectedChainId: config.chainId,
        rpcChainId: chainId,
        matchesExpected: config.chainId === chainId,
        chainName: config.chainName,
        latestBlockNumber,
      },
      contracts,
      proofReady:
        config.chainId === chainId &&
        contracts.some(
          (contract) => contract.label === 'marketplace' && contract.deployed,
        ) &&
        contracts.some(
          (contract) => contract.label === 'nft' && contract.deployed,
        ),
      checkedAt: new Date().toISOString(),
    };
  }

  async getWalletBalances(address: string) {
    if (!this.isValidAddress(address)) {
      throw new BadRequestException('Invalid wallet address');
    }

    const [nativeRawBalance, rawChainId] = await Promise.all([
      this.rpcCall<string>('eth_getBalance', [address, 'latest']),
      this.rpcCall<string>('eth_chainId', []),
    ]);

    const chainId = Number.parseInt(rawChainId, 16);
    const nativeBalance = this.formatWeiToEth(nativeRawBalance);

    return {
      address,
      chainId,
      native: {
        symbol: this.configService.get<string>('WEB3_NATIVE_SYMBOL') ?? 'POL',
        balance: nativeBalance,
      },
      tokens: [],
    };
  }

  async verifyTransaction(txHash: string) {
    if (!this.isValidTxHash(txHash)) {
      throw new BadRequestException('Invalid transaction hash');
    }

    const normalizedHash = txHash.trim();

    const [tx, receipt] = await Promise.all([
      this.rpcCall<{ from?: string; to?: string; value?: string } | null>(
        'eth_getTransactionByHash',
        [normalizedHash],
      ),
      this.rpcCall<{ status?: string; blockNumber?: string } | null>(
        'eth_getTransactionReceipt',
        [normalizedHash],
      ),
    ]);

    return {
      txHash: normalizedHash,
      exists: !!tx,
      confirmed: !!receipt,
      success: receipt?.status
        ? Number.parseInt(receipt.status, 16) === 1
        : null,
      blockNumber: receipt?.blockNumber
        ? Number.parseInt(receipt.blockNumber, 16)
        : null,
      from: tx?.from ?? null,
      to: tx?.to ?? null,
      value: tx?.value ? this.formatWeiToEth(tx.value) : null,
    };
  }

  async reconcileTransaction(userId: string, txHash: string) {
    if (!this.isValidTxHash(txHash)) {
      throw new BadRequestException('Invalid transaction hash');
    }

    const normalizedHash = txHash.trim();
    const verification = await this.verifyTransaction(normalizedHash);

    const chainStatus = !verification.exists
      ? 'missing'
      : !verification.confirmed
        ? 'pending'
        : verification.success === true
          ? 'confirmed'
          : 'failed';

    const walletTransactions = await this.walletTxRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    let walletTransactionsUpdated = 0;
    for (const walletTx of walletTransactions) {
      const metadata: Record<string, unknown> = walletTx.metadata ?? {};
      const metadataTxHash =
        typeof metadata.txHash === 'string' ? metadata.txHash : null;
      if (!metadataTxHash || metadataTxHash.trim() !== normalizedHash) {
        continue;
      }

      walletTx.metadata = {
        ...metadata,
        txHash: normalizedHash,
        chainStatus,
        chainVerification: verification,
      };

      if (chainStatus === 'pending') {
        walletTx.status = 'pending';
      } else if (chainStatus === 'failed') {
        walletTx.status = 'failed';
      } else if (chainStatus === 'confirmed') {
        walletTx.status = 'completed';
      }

      await this.walletTxRepo.save(walletTx);
      walletTransactionsUpdated += 1;
    }

    const listings = await this.listingRepo
      .createQueryBuilder('listing')
      .where('listing.txHash = :txHash', { txHash: normalizedHash })
      .andWhere(
        new Brackets((queryBuilder) => {
          queryBuilder
            .where('listing.sellerId = :userId', { userId })
            .orWhere('listing.buyerId = :userId', { userId });
        }),
      )
      .getMany();

    let listingsUpdated = 0;
    for (const listing of listings) {
      let changed = false;

      if (chainStatus === 'pending') {
        if (listing.status === 'listed' && listing.isActive) {
          listing.status = 'listed_onchain';
          changed = true;
        } else if (listing.status === 'sold') {
          listing.status = 'sold_pending';
          changed = true;
        }
      } else if (chainStatus === 'confirmed') {
        if (listing.status === 'listed_onchain') {
          listing.status = 'listed';
          changed = true;
        } else if (listing.status === 'sold_pending') {
          listing.status = 'sold';
          changed = true;
        }
      } else if (chainStatus === 'failed') {
        if (listing.status === 'listed_onchain') {
          listing.status = 'onchain_failed';
          listing.isActive = false;
          changed = true;
        } else if (
          listing.status === 'sold' ||
          listing.status === 'sold_pending'
        ) {
          listing.status = 'sale_failed';
          changed = true;
        }
      }

      if (changed) {
        await this.listingRepo.save(listing);
        listingsUpdated += 1;
      }
    }

    return {
      txHash: normalizedHash,
      chainStatus,
      verification,
      walletTransactionsUpdated,
      listingsUpdated,
      listingIds: listings.map((listing) => listing.id),
    };
  }
}
