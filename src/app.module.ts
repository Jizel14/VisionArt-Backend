import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { UserPreferencesModule } from './user-preferences/user-preferences.module';
import { SocialModule } from './social/social.module';
import { SeederModule } from './seeders/seeder.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AiModerationModule } from './ai-moderation/ai-moderation.module';
import { ReportsModule } from './reports/reports.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { StorageModule } from './storage/storage.module';
import { getDatabaseConfig } from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot(getDatabaseConfig()),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    UserPreferencesModule,
    SocialModule,
    MarketplaceModule,
    StorageModule,
    SeederModule,
    SubscriptionsModule,
    AiModerationModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
