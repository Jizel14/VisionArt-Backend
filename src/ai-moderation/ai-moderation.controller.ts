import {
  Controller,
  Param,
  Patch,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { Artwork } from '../social/artworks/entities/artwork.entity';
import { ArtworkComment } from '../social/artworks/entities/artwork-comment.entity';
import { ModerationStatus } from './ai-moderation.constants';

@ApiTags('Admin - AI Moderation')
@Controller('moderation')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AiModerationController {
  constructor(
    @InjectRepository(Artwork)
    private readonly artworkRepo: Repository<Artwork>,
    @InjectRepository(ArtworkComment)
    private readonly commentRepo: Repository<ArtworkComment>,
  ) {}

  @Patch(':type/:id/approve')
  @ApiOperation({ summary: 'Approve flagged content (admin only)' })
  async approve(@Param('type') type: string, @Param('id') id: string) {
    return this.updateStatus(type, id, ModerationStatus.APPROVED);
  }

  @Patch(':type/:id/reject')
  @ApiOperation({ summary: 'Reject flagged content (admin only)' })
  async reject(@Param('type') type: string, @Param('id') id: string) {
    return this.updateStatus(type, id, ModerationStatus.REJECTED);
  }

  private async updateStatus(
    type: string,
    id: string,
    status: ModerationStatus,
  ): Promise<{ success: boolean; type: string; id: string; status: ModerationStatus }> {
    if (type === 'artwork') {
      const artwork = await this.artworkRepo.findOne({ where: { id } });
      if (!artwork) throw new NotFoundException('Artwork not found');
      await this.artworkRepo.update(id, { moderationStatus: status });
      return { success: true, type, id, status };
    }

    if (type === 'comment') {
      const comment = await this.commentRepo.findOne({ where: { id } });
      if (!comment) throw new NotFoundException('Comment not found');
      await this.commentRepo.update(id, { moderationStatus: status });
      return { success: true, type, id, status };
    }

    throw new BadRequestException('type must be "artwork" or "comment"');
  }
}
