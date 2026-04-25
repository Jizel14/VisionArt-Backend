import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    // Allow unauthenticated access to NFT metadata endpoint
    if (request.path && request.path.includes('/marketplace/nfts/metadata/')) {
      return true;
    }

    return super.canActivate(context);
  }
}
