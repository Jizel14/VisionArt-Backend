import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  IsEthereumAddress,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ConnectWalletDto {
  @IsString()
  @IsEthereumAddress()
  walletAddress: string;
}

export class WalletAmountDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  txHash?: string;
}

export class WithdrawDto extends WalletAmountDto {
  @IsOptional()
  @IsString()
  @IsEthereumAddress()
  destinationAddress?: string;
}

export class CreateListingDto {
  @IsUUID()
  artworkId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  price: number;

  @IsOptional()
  @IsString()
  @IsIn(['USDC', 'POL'])
  currency?: string;

  @IsOptional()
  @IsBoolean()
  negotiable?: boolean;

  @IsOptional()
  @IsString()
  paymentToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  txHash?: string;
}

export class BuyListingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  txHash?: string;
}

export class ReconcileTransactionDto {
  @IsString()
  @MaxLength(120)
  txHash: string;
}

export class ListListingsDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'sold', 'cancelled', 'all'])
  status?: string;
}
