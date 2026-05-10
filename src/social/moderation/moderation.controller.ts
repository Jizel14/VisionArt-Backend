import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ModerationService } from './moderation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  CreateReportDto,
  ReportResponseDto,
  ArtworkReportDto,
} from './dto/moderation.dto';
import { ReportStatus } from './entities/artwork-report.entity';

@ApiTags('Social - Moderation & Reporting')
@Controller('social')
export class ModerationController {
  constructor(private moderationService: ModerationService) {}

  @Post('artworks/:artworkId/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(201)
  @ApiOperation({ summary: 'Report an artwork' })
  @ApiResponse({ status: 201, type: ReportResponseDto })
  async reportArtwork(
    @CurrentUser() userId: string,
    @Param('artworkId') artworkId: string,
    @Body() dto: CreateReportDto,
  ) {
    return this.moderationService.reportArtwork(artworkId, userId, dto);
  }

  @Get('admin/reports/pending')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending reports (admin only)' })
  @ApiResponse({ status: 200 })
  async getPendingReports(
    @CurrentUser() userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    // TODO: Add admin role check
    // if (!user.isAdmin) throw new ForbiddenException('Admin access required');

    const sanitizedLimit = Math.min(parseInt(limit.toString()) || 20, 100);
    return this.moderationService.getPendingReports(page, sanitizedLimit);
  }

  @Get('admin/reports')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all reports (admin only)' })
  @ApiResponse({ status: 200 })
  async getAllReports(
    @CurrentUser() userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    // TODO: Add admin role check
    // if (!user.isAdmin) throw new ForbiddenException('Admin access required');

    const sanitizedLimit = Math.min(parseInt(limit.toString()) || 20, 100);
    return this.moderationService.getAllReports(page, sanitizedLimit);
  }

  @Get('admin/reports/:reportId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get report details (admin only)' })
  @ApiResponse({ status: 200, type: ArtworkReportDto })
  async getReportById(
    @CurrentUser() userId: string,
    @Param('reportId') reportId: string,
  ) {
    // TODO: Add admin role check
    return this.moderationService.getReportById(reportId);
  }

  @Patch('admin/reports/:reportId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update report status (admin only)' })
  async updateReportStatus(
    @CurrentUser() userId: string,
    @Param('reportId') reportId: string,
    @Body() body: { status: ReportStatus },
  ) {
    // TODO: Add admin role check
    return this.moderationService.updateReportStatus(reportId, body.status);
  }
}
