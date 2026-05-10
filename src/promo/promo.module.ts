import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCode } from './entities/promo-code.entity';
import { PromoService } from './promo.service';

@Module({
  imports: [TypeOrmModule.forFeature([PromoCode])],
  providers: [PromoService],
  exports: [PromoService],
})
export class PromoModule {}
