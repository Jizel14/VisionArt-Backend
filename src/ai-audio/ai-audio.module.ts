import { Module } from '@nestjs/common';
import { AiAudioService } from './ai-audio.service';
import { AiAudioController } from './ai-audio.controller';

@Module({
  controllers: [AiAudioController],
  providers: [AiAudioService],
  exports: [AiAudioService],
})
export class AiAudioModule {}
