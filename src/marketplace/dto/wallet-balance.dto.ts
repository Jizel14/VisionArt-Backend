import { IsEthereumAddress, IsString } from 'class-validator';

export class WalletAddressParamsDto {
  @IsString()
  @IsEthereumAddress()
  address: string;
}

export class VerifyTransactionParamsDto {
  @IsString()
  txHash: string;
}
