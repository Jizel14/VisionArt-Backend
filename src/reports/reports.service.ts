import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus, ReportType } from './report.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly repo: Repository<Report>,
  ) {}

  async create(data: {
    userId: string;
    type: string;
    subject: string;
    description: string;
    targetId?: string | null;
    imageUrl?: string | null;
  }) {
    const report = this.repo.create({
      userId: data.userId,
      type: (Object.values(ReportType).includes(data.type as ReportType)
        ? data.type
        : ReportType.OTHER) as ReportType,
      subject: data.subject,
      description: data.description,
      targetId: data.targetId || null,
      imageUrl: data.imageUrl || null,
      status: ReportStatus.PENDING,
    });
    return this.repo.save(report);
  }
}
