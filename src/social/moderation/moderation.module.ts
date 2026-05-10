import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ArtworkReport } from './entities/artwork-report.entity';
import { Artwork } from '../artworks/entities/artwork.entity';
import { User } from '../../users/user.entity';
import { ReportsModule } from '../../reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArtworkReport, Artwork, User]),
    ReportsModule,
  ],
  providers: [ModerationService],
  controllers: [ModerationController],
  exports: [ModerationService],
})
export class ModerationModule {}
