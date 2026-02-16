import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus } from './report.entity';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private readonly repo: Repository<Report>,
  ) {}

  async create(userId: string, dto: CreateReportDto): Promise<Report> {
    const report = this.repo.create({
      userId,
      type: dto.type as Report['type'],
      targetId: dto.targetId ?? null,
      subject: dto.subject,
      description: dto.description,
      imageUrl: dto.imageUrl ?? null,
      status: 'pending',
    });
    return this.repo.save(report);
  }

  async findAll(opts?: {
    page?: number;
    pageSize?: number;
    type?: string;
    status?: string;
  }): Promise<{ items: Report[]; total: number }> {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 20;
    const qb = this.repo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.user', 'user')
      .orderBy('report.createdAt', 'DESC');

    if (opts?.type) qb.andWhere('report.type = :type', { type: opts.type });
    if (opts?.status) qb.andWhere('report.status = :status', { status: opts.status });

    const [items, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { items, total };
  }

  async findById(id: string): Promise<Report> {
    const report = await this.repo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async findByUser(userId: string): Promise<Report[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(id: string, status: ReportStatus, adminNote?: string): Promise<Report> {
    const report = await this.findById(id);
    report.status = status;
    if (adminNote !== undefined) report.adminNote = adminNote;
    return this.repo.save(report);
  }

  async delete(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException('Report not found');
  }
}
