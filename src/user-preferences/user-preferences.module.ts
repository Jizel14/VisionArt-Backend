import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPreferencesService } from './user-preferences.service';
import { UserPreferencesController } from './user-preferences.controller';
import { UserPreferences } from './entities/user-preferences.entity';
import { AiAudioModule } from '../ai-audio/ai-audio.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserPreferences]), AiAudioModule],
  controllers: [UserPreferencesController],
  providers: [UserPreferencesService],
  exports: [UserPreferencesService],
})
export class UserPreferencesModule {}
