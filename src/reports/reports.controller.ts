import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateReportDto } from './dto/create-report.dto';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createReport(
    @CurrentUser() userId: string,
    @Body() dto: CreateReportDto,
  ) {
    const report = await this.reportsService.create({
      userId,
      type: dto.type,
      subject: dto.subject,
      description: dto.description,
      targetId: dto.targetId,
      imageUrl: dto.imageUrl,
    });
    return { success: true, reportId: report.id, message: 'Report submitted successfully.' };
  }
}
