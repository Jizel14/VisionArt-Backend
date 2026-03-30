import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { ethers } from 'ethers';
import { MarketplaceWallet } from './entities/marketplace-wallet.entity';
import { MarketplaceWalletTransaction } from './entities/marketplace-wallet-transaction.entity';
import { MarketplaceListing } from './entities/marketplace-listing.entity';
import { Artwork } from '../social/artworks/entities/artwork.entity';

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
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
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

      const amountUnits = ethers.parseUnits(amount.toFixed(6), 18);
      const treasuryBalance = await signer.provider!.getBalance(signerAddress);
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
      chainVerification = await this.verifyTransaction(chainTx.hash);
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
      currency: wallet.currency,
      reference: reference?.trim() || null,
      metadata: {
        destinationAddress: normalizedDestination,
        txHash: effectiveTxHash,
        chainVerification,
      },
    });
    await this.walletTxRepo.save(transaction);

    return {
      success: true,
      balance: this.toAmount(wallet.availableBalance),
      transactionId: transaction.id,
      txHash: effectiveTxHash,
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

  async buyListing(userId: string, listingId: string, txHash?: string) {
    return this.dataSource.transaction(async (manager) => {
      const listingRepo = manager.getRepository(MarketplaceListing);
      const walletRepo = manager.getRepository(MarketplaceWallet);
      const walletTxRepo = manager.getRepository(MarketplaceWalletTransaction);
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

      const price = this.toAmount(listing.price);
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
      listing.soldAt = new Date();
      if (txHash?.trim().length) {
        listing.txHash = txHash.trim();
      }

      await listingRepo.save(listing);

      // Mock marketplace mode: transfer artwork ownership in DB after payment.
      artwork.userId = userId;
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

  async listMyListings(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const [rows, total] = await this.listingRepo.findAndCount({
      where: { sellerId: userId },
      order: { createdAt: 'DESC' },
      relations: ['artwork'],
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      data: rows.map((listing) => ({
        id: listing.id,
        artworkId: listing.artworkId,
        price: this.toAmount(listing.price),
        currency: listing.currency,
        status: listing.status,
        isActive: listing.isActive,
        artwork: listing.artwork
          ? {
              id: listing.artwork.id,
              title: listing.artwork.title,
              imageUrl: listing.artwork.imageUrl,
            }
          : null,
        createdAt: listing.createdAt,
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
