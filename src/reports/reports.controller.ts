import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /* ========== User-facing endpoints ========== */

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a new report (artwork, bug, user, other)' })
  async create(
    @CurrentUser() userId: string,
    @Body() dto: CreateReportDto,
  ) {
    const report = await this.reportsService.create(userId, dto);
    return { message: 'Report submitted successfully', reportId: report.id };
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reports submitted by the current user' })
  async myReports(@CurrentUser() userId: string) {
    return this.reportsService.findByUser(userId);
  }

  /* ========== Admin endpoints (for backoffice) ========== */

  @Get()
  @ApiOperation({ summary: 'List all reports (admin)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'status', required: false })
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.reportsService.findAll({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      type: type || undefined,
      status: status || undefined,
    });
    return {
      items: result.items.map((r) => ({
        id: r.id,
        type: r.type,
        targetId: r.targetId,
        subject: r.subject,
        description: r.description,
        imageUrl: r.imageUrl,
        status: r.status,
        adminNote: r.adminNote,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        user: r.user
          ? { id: r.user.id, name: r.user.name, email: r.user.email }
          : null,
      })),
      total: result.total,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single report by ID (admin)' })
  async findOne(@Param('id') id: string) {
    return this.reportsService.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update report status (admin)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; adminNote?: string },
  ) {
    return this.reportsService.updateStatus(
      id,
      body.status as 'pending' | 'reviewing' | 'resolved' | 'dismissed',
      body.adminNote,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a report (admin)' })
  async remove(@Param('id') id: string) {
    await this.reportsService.delete(id);
    return { message: 'Report deleted' };
  }
}
