import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArtworkReport, ReportStatus } from './entities/artwork-report.entity';
import { Artwork } from '../artworks/entities/artwork.entity';
import { User } from '../../users/user.entity';
import { CreateReportDto } from './dto/moderation.dto';

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(ArtworkReport)
    private reportRepository: Repository<ArtworkReport>,
    @InjectRepository(Artwork)
    private artworkRepository: Repository<Artwork>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Report an artwork
   */
  async reportArtwork(
    artworkId: string,
    reporterId: string,
    dto: CreateReportDto,
  ) {
    const artwork = await this.artworkRepository.findOne({
      where: { id: artworkId },
    });

    if (!artwork) {
      throw new NotFoundException('Artwork not found');
    }

    // Check if user has already reported this artwork
    const existing = await this.reportRepository.findOne({
      where: { artworkId, reporterId },
    });

    if (existing) {
      throw new BadRequestException('You have already reported this artwork');
    }

    const report = this.reportRepository.create({
      artworkId,
      reporterId,
      ...dto,
    });

    const saved = await this.reportRepository.save(report);

    return {
      success: true,
      reportId: saved.id,
      message:
        'Report submitted successfully. Thank you for helping keep VisionArt safe.',
    };
  }

  /**
   * Get pending reports (admin only)
   */
  async getPendingReports(page: number = 1, limit: number = 20) {
    const [reports, total] = await this.reportRepository.findAndCount({
      where: { status: ReportStatus.PENDING },
      relations: ['artwork', 'artwork.user', 'reporter'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const data = reports.map((report) => ({
      id: report.id,
      artworkId: report.artworkId,
      reporter: {
        id: report.reporter.id,
        name: report.reporter.name,
        email: report.reporter.email,
      },
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      artwork: {
        id: report.artwork.id,
        title: report.artwork.title,
        imageUrl: report.artwork.imageUrl,
        user: {
          name: report.artwork.user.name,
          email: report.artwork.user.email,
        },
      },
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all reports (admin only)
   */
  async getAllReports(page: number = 1, limit: number = 20) {
    const [reports, total] = await this.reportRepository.findAndCount({
      relations: ['artwork', 'artwork.user', 'reporter'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const data = reports.map((report) => ({
      id: report.id,
      artworkId: report.artworkId,
      reporter: {
        id: report.reporter.id,
        name: report.reporter.name,
        email: report.reporter.email,
      },
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      artwork: {
        id: report.artwork.id,
        title: report.artwork.title,
        imageUrl: report.artwork.imageUrl,
        user: {
          name: report.artwork.user.name,
          email: report.artwork.user.email,
        },
      },
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update report status (admin only)
   */
  async updateReportStatus(reportId: string, status: ReportStatus) {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    report.status = status;

    const updated = await this.reportRepository.save(report);

    return {
      success: true,
      status: updated.status,
      message: `Report marked as ${status}`,
    };
  }

  /**
   * Get report by ID (admin only)
   */
  async getReportById(reportId: string) {
    const report = await this.reportRepository.findOne({
      where: { id: reportId },
      relations: ['artwork', 'artwork.user', 'reporter'],
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return {
      id: report.id,
      artworkId: report.artworkId,
      reporter: {
        id: report.reporter.id,
        name: report.reporter.name,
        email: report.reporter.email,
      },
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      artwork: {
        id: report.artwork.id,
        title: report.artwork.title,
        imageUrl: report.artwork.imageUrl,
        user: {
          name: report.artwork.user.name,
          email: report.artwork.user.email,
        },
      },
    };
  }
}
