import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { PromoCode } from './entities/promo-code.entity';

@Injectable()
export class PromoService {
  private readonly logger = new Logger(PromoService.name);

  constructor(
    @InjectRepository(PromoCode)
    private readonly repo: Repository<PromoCode>,
  ) {}

  /**
   * Generate a single-use promo code attached to a user and a segment.
   * Code format: `<SEG>-<RANDOM6>` e.g. `WB30-7K3FP9`.
   */
  async issueCode(args: {
    segment: string;
    userId: string | null;
    discountPct: number;
    freeMonths?: number;
    validForDays?: number;
    maxUses?: number;
  }): Promise<PromoCode> {
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + (args.validForDays ?? 14));

    const prefix = args.segment.replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'VIS';
    const suffix = randomBytes(4).toString('base64url').toUpperCase().slice(0, 6);
    const code = `${prefix}-${suffix}`;

    const promo = this.repo.create({
      code,
      segment: args.segment,
      userId: args.userId,
      discountPct: args.discountPct,
      freeMonths: args.freeMonths ?? 0,
      validUntil,
      maxUses: args.maxUses ?? 1,
      usedCount: 0,
    });

    await this.repo.save(promo);
    this.logger.log(
      `Issued promo code ${code} (${args.discountPct}%) for segment=${args.segment} user=${args.userId ?? 'generic'}`,
    );
    return promo;
  }

  async validate(
    code: string,
    userId: string | null,
  ): Promise<{ valid: boolean; reason?: string; promo?: PromoCode }> {
    const promo = await this.repo.findOne({ where: { code } });
    if (!promo) return { valid: false, reason: 'NOT_FOUND' };
    if (promo.validUntil < new Date()) return { valid: false, reason: 'EXPIRED' };
    if (promo.usedCount >= promo.maxUses) return { valid: false, reason: 'EXHAUSTED' };
    if (promo.userId && userId && promo.userId !== userId) {
      return { valid: false, reason: 'NOT_OWNER' };
    }
    return { valid: true, promo };
  }

  async markUsed(code: string): Promise<void> {
    await this.repo.increment({ code }, 'usedCount', 1);
  }
}
