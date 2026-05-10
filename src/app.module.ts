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
import { ChatModule } from './chat/chat.module';
import { AiAudioModule } from './ai-audio/ai-audio.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { PromoModule } from './promo/promo.module';
import { RetentionModule } from './retention/retention.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { getDatabaseConfig } from './config/database.config';
import { resolve } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Chemin absolu : évite de ne pas charger .env si le cwd Nest n’est pas la racine du projet.
      envFilePath: resolve(process.cwd(), '.env'),
      expandVariables: true,
    }),
    TypeOrmModule.forRoot(getDatabaseConfig()),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    UserPreferencesModule,
    SocialModule,
    MarketplaceModule,
    StorageModule,
    ChatModule,
    SeederModule,
    SubscriptionsModule,
    AiModerationModule,
    ReportsModule,
    AiAudioModule,
    LoyaltyModule,
    PromoModule,
    RetentionModule,
    AnnouncementsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
