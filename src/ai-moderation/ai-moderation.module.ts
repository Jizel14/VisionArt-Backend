import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModerationService } from './ai-moderation.service';
import { AiModerationInterceptor } from './ai-moderation.interceptor';
import { AiModerationController } from './ai-moderation.controller';
import { AdminGuard } from './guards/admin.guard';
import { Artwork } from '../social/artworks/entities/artwork.entity';
import { ArtworkComment } from '../social/artworks/entities/artwork-comment.entity';
import { User } from '../users/user.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Artwork, ArtworkComment, User])],
  providers: [AiModerationService, AiModerationInterceptor, AdminGuard],
  controllers: [AiModerationController],
  exports: [AiModerationService, AiModerationInterceptor, AdminGuard],
})
export class AiModerationModule {}
