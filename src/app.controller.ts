import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('announcements/active')
  async getActiveAnnouncement() {
    try {
      const rows = await this.dataSource.query(
        `SELECT id, message, created_at FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1`,
      );
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }
}
